import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../app/providers/AuthProvider';
import type {
  TutorialContextState,
  TutorialMode,
  TutorialProgress,
  TutorialScenario,
} from './tutorial-types';
import { DEFAULT_PROGRESS, PROGRESS_STORAGE_KEY } from './tutorial-types';
import { getAutoTriggerScenario, getMatchingScenarios } from './tutorial-scenarios';

// ═══════════════════════════════════════════════
// Actions
// ═══════════════════════════════════════════════

type TutorialAction =
  | { type: 'START'; scenario: TutorialScenario }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'GO_TO_STEP'; index: number }
  | { type: 'CLOSE' }
  | { type: 'SKIP' }
  | { type: 'DISMISS_SCENARIO'; scenarioId: string }
  | { type: 'DISABLE_SCENARIO'; scenarioId: string }
  | { type: 'DISABLE_PAGE'; route: string }
  | { type: 'ENABLE_PAGE'; route: string }
  | { type: 'REPLAY'; scenarioId: string; scenario: TutorialScenario }
  | { type: 'TOGGLE_HELP_PANEL' }
  | { type: 'CLOSE_HELP_PANEL' }
  | { type: 'SET_PROGRESS'; progress: TutorialProgress };

// ═══════════════════════════════════════════════
// Persistence helpers
// ═══════════════════════════════════════════════

function loadProgress(): TutorialProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROGRESS };
    return { ...DEFAULT_PROGRESS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

function saveProgress(p: TutorialProgress) {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(p));
  } catch {
    // quota exceeded — silently fail
  }
}

// ═══════════════════════════════════════════════
// Reducer
// ═══════════════════════════════════════════════

function reducer(state: TutorialContextState, action: TutorialAction): TutorialContextState {
  switch (action.type) {
    case 'START': {
      const partial = state.progress.partialProgress[action.scenario.id] ?? 0;
      const startStep = partial > 0 && partial < action.scenario.steps.length ? partial : 0;
      const newProgress = {
        ...state.progress,
        lastShownAt: Date.now(),
      };
      saveProgress(newProgress);
      return {
        ...state,
        activeScenario: action.scenario,
        currentStep: startStep,
        isActive: true,
        mode: action.scenario.mode,
        progress: newProgress,
        helpPanelOpen: false,
      };
    }

    case 'NEXT_STEP': {
      if (!state.activeScenario) return state;
      const next = state.currentStep + 1;
      if (next >= state.activeScenario.steps.length) {
        // Mark scenario completed
        const newProgress: TutorialProgress = {
          ...state.progress,
          completedScenarios: [...new Set([...state.progress.completedScenarios, state.activeScenario.id])],
          totalCompleted: state.progress.totalCompleted + 1,
          partialProgress: { ...state.progress.partialProgress },
        };
        delete newProgress.partialProgress[state.activeScenario.id];
        // Auto-level detection
        if (newProgress.totalCompleted >= 8) newProgress.userLevel = 'advanced';
        else if (newProgress.totalCompleted >= 3) newProgress.userLevel = 'intermediate';
        saveProgress(newProgress);
        return { ...state, activeScenario: null, currentStep: 0, isActive: false, progress: newProgress };
      }
      const updatedProgress = {
        ...state.progress,
        partialProgress: { ...state.progress.partialProgress, [state.activeScenario.id]: next },
      };
      saveProgress(updatedProgress);
      return { ...state, currentStep: next, progress: updatedProgress };
    }

    case 'PREV_STEP': {
      if (!state.activeScenario || state.currentStep <= 0) return state;
      return { ...state, currentStep: state.currentStep - 1 };
    }

    case 'GO_TO_STEP': {
      if (!state.activeScenario || action.index < 0 || action.index >= state.activeScenario.steps.length) return state;
      return { ...state, currentStep: action.index };
    }

    case 'CLOSE': {
      if (state.activeScenario) {
        const pp = {
          ...state.progress,
          partialProgress: { ...state.progress.partialProgress, [state.activeScenario.id]: state.currentStep },
        };
        saveProgress(pp);
        return { ...state, activeScenario: null, currentStep: 0, isActive: false, progress: pp };
      }
      return { ...state, isActive: false, helpPanelOpen: false };
    }

    case 'SKIP': {
      if (!state.activeScenario) return state;
      const newProgress: TutorialProgress = {
        ...state.progress,
        dismissedScenarios: [...new Set([...state.progress.dismissedScenarios, state.activeScenario.id])],
        partialProgress: { ...state.progress.partialProgress },
      };
      delete newProgress.partialProgress[state.activeScenario.id];
      saveProgress(newProgress);
      return { ...state, activeScenario: null, currentStep: 0, isActive: false, progress: newProgress };
    }

    case 'DISMISS_SCENARIO': {
      const newProgress: TutorialProgress = {
        ...state.progress,
        dismissedScenarios: [...new Set([...state.progress.dismissedScenarios, action.scenarioId])],
      };
      saveProgress(newProgress);
      return { ...state, progress: newProgress };
    }

    case 'DISABLE_SCENARIO': {
      const newProgress: TutorialProgress = {
        ...state.progress,
        disabledScenarios: [...new Set([...state.progress.disabledScenarios, action.scenarioId])],
      };
      saveProgress(newProgress);
      return { ...state, progress: newProgress };
    }

    case 'DISABLE_PAGE': {
      const newProgress: TutorialProgress = {
        ...state.progress,
        disabledPages: [...new Set([...state.progress.disabledPages, action.route])],
      };
      saveProgress(newProgress);
      return { ...state, progress: newProgress };
    }

    case 'ENABLE_PAGE': {
      const newProgress: TutorialProgress = {
        ...state.progress,
        disabledPages: state.progress.disabledPages.filter(p => p !== action.route),
      };
      saveProgress(newProgress);
      return { ...state, progress: newProgress };
    }

    case 'REPLAY': {
      const newProgress: TutorialProgress = {
        ...state.progress,
        completedScenarios: state.progress.completedScenarios.filter(id => id !== action.scenarioId),
        dismissedScenarios: state.progress.dismissedScenarios.filter(id => id !== action.scenarioId),
        disabledScenarios: state.progress.disabledScenarios.filter(id => id !== action.scenarioId),
        lastShownAt: Date.now(),
      };
      delete newProgress.partialProgress[action.scenarioId];
      saveProgress(newProgress);
      return {
        ...state,
        activeScenario: action.scenario,
        currentStep: 0,
        isActive: true,
        mode: action.scenario.mode,
        progress: newProgress,
        helpPanelOpen: false,
      };
    }

    case 'TOGGLE_HELP_PANEL':
      return { ...state, helpPanelOpen: !state.helpPanelOpen };

    case 'CLOSE_HELP_PANEL':
      return { ...state, helpPanelOpen: false };

    case 'SET_PROGRESS': {
      saveProgress(action.progress);
      return { ...state, progress: action.progress };
    }

    default:
      return state;
  }
}

// ═══════════════════════════════════════════════
// Context
// ═══════════════════════════════════════════════

interface TutorialContextValue extends TutorialContextState {
  startScenario: (id: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (index: number) => void;
  closeTutorial: () => void;
  skipScenario: () => void;
  dismissScenario: (id: string) => void;
  disableScenario: (id: string) => void;
  disableForPage: (route: string) => void;
  enableForPage: (route: string) => void;
  replayScenario: (id: string) => void;
  toggleHelpPanel: () => void;
  closeHelpPanel: () => void;
  availableScenarios: TutorialScenario[];
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

// ═══════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════

const INITIAL_STATE: TutorialContextState = {
  activeScenario: null,
  currentStep: 0,
  isActive: false,
  mode: 'guided',
  progress: loadProgress(),
  helpPanelOpen: false,
};

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const location = useLocation();
  const { user } = useAuth();
  const autoTriggeredRef = useRef<string>('');

  // Available scenarios for current page/role
  const availableScenarios = useMemo(
    () => getMatchingScenarios(location.pathname, user?.role),
    [location.pathname, user?.role],
  );

  // Auto-trigger on page change
  useEffect(() => {
    if (state.isActive) return;
    const key = `${location.pathname}::${user?.role ?? 'GUEST'}`;
    if (autoTriggeredRef.current === key) return;

    const timeout = setTimeout(() => {
      const scenario = getAutoTriggerScenario(
        location.pathname,
        user?.role,
        state.progress.completedScenarios,
        state.progress.dismissedScenarios,
        state.progress.disabledScenarios,
        state.progress.disabledPages,
        state.progress.lastShownAt,
      );
      if (scenario) {
        autoTriggeredRef.current = key;
        dispatch({ type: 'START', scenario });
      }
    }, 1500); // Wait for page to settle

    return () => clearTimeout(timeout);
  }, [location.pathname, user?.role, state.isActive, state.progress]);

  // Callbacks
  const startScenario = useCallback((id: string) => {
    const scenario = availableScenarios.find(s => s.id === id);
    if (scenario) dispatch({ type: 'START', scenario });
  }, [availableScenarios]);

  const nextStep = useCallback(() => dispatch({ type: 'NEXT_STEP' }), []);
  const prevStep = useCallback(() => dispatch({ type: 'PREV_STEP' }), []);
  const goToStep = useCallback((index: number) => dispatch({ type: 'GO_TO_STEP', index }), []);
  const closeTutorial = useCallback(() => dispatch({ type: 'CLOSE' }), []);
  const skipScenario = useCallback(() => dispatch({ type: 'SKIP' }), []);
  const dismissScenario = useCallback((id: string) => dispatch({ type: 'DISMISS_SCENARIO', scenarioId: id }), []);
  const disableScenario = useCallback((id: string) => dispatch({ type: 'DISABLE_SCENARIO', scenarioId: id }), []);
  const disableForPage = useCallback((route: string) => dispatch({ type: 'DISABLE_PAGE', route }), []);
  const enableForPage = useCallback((route: string) => dispatch({ type: 'ENABLE_PAGE', route }), []);
  const toggleHelpPanel = useCallback(() => dispatch({ type: 'TOGGLE_HELP_PANEL' }), []);
  const closeHelpPanel = useCallback(() => dispatch({ type: 'CLOSE_HELP_PANEL' }), []);

  const replayScenario = useCallback((id: string) => {
    const all = getMatchingScenarios(location.pathname, user?.role);
    const scenario = all.find(s => s.id === id);
    if (scenario) dispatch({ type: 'REPLAY', scenarioId: id, scenario });
  }, [location.pathname, user?.role]);

  const value = useMemo<TutorialContextValue>(() => ({
    ...state,
    startScenario,
    nextStep,
    prevStep,
    goToStep,
    closeTutorial,
    skipScenario,
    dismissScenario,
    disableScenario,
    disableForPage,
    enableForPage,
    replayScenario,
    toggleHelpPanel,
    closeHelpPanel,
    availableScenarios,
  }), [
    state,
    startScenario,
    nextStep,
    prevStep,
    goToStep,
    closeTutorial,
    skipScenario,
    dismissScenario,
    disableScenario,
    disableForPage,
    enableForPage,
    replayScenario,
    toggleHelpPanel,
    closeHelpPanel,
    availableScenarios,
  ]);

  return (
    <TutorialContext.Provider value={value}>
      {children}
    </TutorialContext.Provider>
  );
}

// ═══════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════

export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorial must be used within TutorialProvider');
  return ctx;
}
