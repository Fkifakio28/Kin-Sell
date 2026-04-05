// ══════════════════════════════════════════════
// IA TUTO KIN-SELL — Types & Configuration
// ══════════════════════════════════════════════

export type TutorialMode = 'guided' | 'contextual';

export type UserLevel = 'beginner' | 'intermediate' | 'advanced';

export interface TutorialStep {
  id: string;
  /** CSS selector of the element to highlight */
  target: string;
  /** Title displayed in the popup */
  title: string;
  /** Main content — adapts to device size */
  content: string;
  /** Short content for mobile (optional, falls back to content) */
  contentMobile?: string;
  /** Position of the popup relative to the highlighted element */
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  /** Optional action the user must take before advancing */
  waitForAction?: 'click' | 'input' | 'scroll' | 'none';
  /** Selector of action element to monitor (defaults to target) */
  actionTarget?: string;
  /** Optional callback ID for custom logic */
  onEnter?: string;
  /** Whether to scroll the element into view */
  scrollIntoView?: boolean;
  /** Delay before showing this step (ms) */
  delay?: number;
  /** Whether this step can be skipped */
  skippable?: boolean;
}

export interface TutorialScenario {
  id: string;
  /** Display name */
  name: string;
  /** Short description of what this tutorial covers */
  description: string;
  /** Which pages/routes this scenario applies to */
  routes: string[];
  /** Which roles can see this tutorial */
  roles: ('USER' | 'BUSINESS' | 'ADMIN' | 'SUPER_ADMIN' | 'GUEST')[];
  /** Mode: guided walkthrough or contextual tips */
  mode: TutorialMode;
  /** Steps in this scenario */
  steps: TutorialStep[];
  /** Category for grouping */
  category: 'onboarding' | 'transaction' | 'sokin' | 'dashboard' | 'public' | 'admin';
  /** Priority for auto-trigger (higher = shown first) */
  priority: number;
  /** Auto-trigger on first visit? */
  autoTrigger: boolean;
  /** Minimum delay since last tutorial shown (ms) */
  cooldown?: number;
}

export interface TutorialProgress {
  completedScenarios: string[];
  dismissedScenarios: string[];
  /** Scenarios the user chose "don't show again" */
  disabledScenarios: string[];
  /** Per-page dismissal */
  disabledPages: string[];
  /** Steps completed within partially-viewed scenarios */
  partialProgress: Record<string, number>;
  /** Last tutorial shown timestamp */
  lastShownAt: number;
  /** Total tutorials completed */
  totalCompleted: number;
  /** User skill level (auto-detected or set) */
  userLevel: UserLevel;
}

export interface TutorialContextState {
  /** Currently active scenario */
  activeScenario: TutorialScenario | null;
  /** Current step index */
  currentStep: number;
  /** Is a tutorial currently running */
  isActive: boolean;
  /** Mode of the current session */
  mode: TutorialMode;
  /** User progress */
  progress: TutorialProgress;
  /** Is the help panel open */
  helpPanelOpen: boolean;
}

export const DEFAULT_PROGRESS: TutorialProgress = {
  completedScenarios: [],
  dismissedScenarios: [],
  disabledScenarios: [],
  disabledPages: [],
  partialProgress: {},
  lastShownAt: 0,
  totalCompleted: 0,
  userLevel: 'beginner',
};

export const PROGRESS_STORAGE_KEY = 'ks-tutorial-progress';
export const TUTORIAL_COOLDOWN = 5 * 60 * 1000; // 5 min between auto-triggers
