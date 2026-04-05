import { useLocation } from 'react-router-dom';
import { useTutorial } from './TutorialProvider';
import './tutorial.css';

// ═══════════════════════════════════════════════
// IA TUTO KIN-SELL — Floating Help Button + Panel
// ═══════════════════════════════════════════════

export function TutorialHelpButton() {
  const {
    isActive,
    helpPanelOpen,
    toggleHelpPanel,
    closeHelpPanel,
    startScenario,
    replayScenario,
    disableForPage,
    enableForPage,
    availableScenarios,
    progress,
  } = useTutorial();

  const location = useLocation();

  // Hide FAB when tutorial is active
  if (isActive) return null;

  const isPageDisabled = progress.disabledPages.some(p => location.pathname.startsWith(p));

  return (
    <>
      {/* FAB */}
      <button
        className="tuto-fab"
        onClick={toggleHelpPanel}
        aria-label="Aide tutoriel"
        title="Aide & Tutoriels"
      >
        {helpPanelOpen ? '✕' : '?'}
      </button>

      {/* Help Panel */}
      {helpPanelOpen && (
        <div className="tuto-help-panel" role="dialog" aria-label="Tutoriels disponibles">
          <div className="tuto-help-title">
            <span>💡</span> Tutoriels disponibles
          </div>

          {availableScenarios.length === 0 ? (
            <div className="tuto-help-empty">
              Aucun tutoriel disponible sur cette page.
            </div>
          ) : (
            <div className="tuto-help-list">
              {availableScenarios.map(s => {
                const isDone = progress.completedScenarios.includes(s.id);
                const isDismissed = progress.dismissedScenarios.includes(s.id);

                return (
                  <div
                    key={s.id}
                    className="tuto-help-item"
                    onClick={() => {
                      closeHelpPanel();
                      if (isDone || isDismissed) {
                        replayScenario(s.id);
                      } else {
                        startScenario(s.id);
                      }
                    }}
                  >
                    <div>
                      <div className="tuto-help-item-name">{s.name}</div>
                      <div className="tuto-help-item-desc">{s.description}</div>
                    </div>
                    {isDone ? (
                      <span className="tuto-help-item-badge tuto-help-item-badge--done">✓ Fait</span>
                    ) : (
                      <span className="tuto-help-item-badge tuto-help-item-badge--new">Lancer</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Page toggle */}
          <div className="tuto-help-footer">
            {isPageDisabled ? (
              <button
                className="tuto-link"
                onClick={() => enableForPage(location.pathname)}
              >
                Réactiver les tutos sur cette page
              </button>
            ) : (
              <button
                className="tuto-link"
                onClick={() => { disableForPage(location.pathname); closeHelpPanel(); }}
              >
                Désactiver sur cette page
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
