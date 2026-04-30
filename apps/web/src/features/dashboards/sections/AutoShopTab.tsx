import { useEffect, useState, useCallback } from 'react';
import { autoShop, type AutoShopListing, type AutoNegoRules } from '../../../lib/api-client';

const DEFAULT_RULES: AutoNegoRules = {
  enabled: true,
  minFloorPercent: 75,
  maxAutoDiscountPercent: 20,
  preferredCounterPercent: 90,
  firmness: 'BALANCED',
};

const FIRMNESS_LABELS: Record<string, { label: string; icon: string; desc: string }> = {
  FLEXIBLE: { label: 'Souple', icon: '🟢', desc: 'Accepte facilement, priorité rapidité' },
  BALANCED: { label: 'Modéré', icon: '🟡', desc: 'Équilibre entre marge et vitesse' },
  FIRM: { label: 'Ferme', icon: '🔴', desc: 'Protège la marge, refuse plus souvent' },
};

type Props = {
  t: (key: string) => string;
  formatMoney: (cents: number) => string;
};

export function AutoShopTab({ t, formatMoney }: Props) {
  const [listings, setListings] = useState<AutoShopListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRules, setEditRules] = useState<AutoNegoRules>(DEFAULT_RULES);
  const [bulkRules, setBulkRules] = useState<AutoNegoRules>(DEFAULT_RULES);
  const [showBulk, setShowBulk] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const loadListings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await autoShop.getListings();
      setListings(data);
    } catch {
      setToast('Erreur chargement articles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadListings(); }, [loadListings]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const openEdit = (listing: AutoShopListing) => {
    setEditingId(listing.id);
    setEditRules(listing.autoNegoRules ?? DEFAULT_RULES);
  };

  const saveRules = async (listingId: string) => {
    try {
      setSaving(listingId);
      await autoShop.updateRules(listingId, editRules);
      setListings(prev => prev.map(l => l.id === listingId ? { ...l, autoNegoRules: editRules } : l));
      setEditingId(null);
      setToast('✅ Règles sauvegardées');
    } catch {
      setToast('❌ Erreur sauvegarde');
    } finally {
      setSaving(null);
    }
  };

  const applyBulk = async () => {
    try {
      setBulkSaving(true);
      const result = await autoShop.bulkUpdateRules(bulkRules);
      setToast(`✅ ${result.updated} articles mis à jour`);
      setShowBulk(false);
      void loadListings();
    } catch {
      setToast('❌ Erreur mise à jour groupée');
    } finally {
      setBulkSaving(false);
    }
  };

  const negotiableListings = listings.filter(l => l.isNegotiable);
  const enabledCount = negotiableListings.filter(l => l.autoNegoRules?.enabled).length;

  return (
    <div className="ud-section animate-fade-in">
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 9999,
          background: 'rgba(18,11,43,0.95)', border: '1px solid rgba(111,88,255,0.3)',
          borderRadius: 10, padding: '10px 20px', color: '#e0d8ff', fontSize: 13,
          backdropFilter: 'blur(10px)',
        }}>
          {toast}
        </div>
      )}

      <section className="ud-glass-panel">
        <div className="ud-panel-head">
          <h2 className="ud-panel-title">🤖 {t('user.autoShop')}</h2>
        </div>

        {/* Stats résumé */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 10, marginBottom: 16,
        }}>
          <StatCard label="Articles actifs" value={listings.length} />
          <StatCard label="Négociables" value={negotiableListings.length} />
          <StatCard label="Auto activé" value={enabledCount} accent />
        </div>

        {/* Bouton appliquer à tous */}
        {negotiableListings.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <button
              type="button"
              onClick={() => setShowBulk(!showBulk)}
              style={{
                background: showBulk ? 'rgba(111,88,255,0.2)' : 'rgba(111,88,255,0.08)',
                border: '1px solid rgba(111,88,255,0.2)', borderRadius: 8,
                color: '#6f58ff', fontSize: 13, padding: '8px 16px', cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              ⚡ Appliquer à tous les articles
            </button>
          </div>
        )}

        {/* Panel bulk */}
        {showBulk && (
          <div style={{
            background: 'rgba(111,88,255,0.06)', border: '1px solid rgba(111,88,255,0.15)',
            borderRadius: 12, padding: 16, marginBottom: 16,
          }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#fff' }}>
              Règles globales pour {negotiableListings.length} articles
            </h3>
            <RulesForm rules={bulkRules} onChange={setBulkRules} formatMoney={formatMoney} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={applyBulk}
                disabled={bulkSaving}
                style={{
                  background: '#6f58ff', color: '#fff', border: 'none', borderRadius: 8,
                  padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  opacity: bulkSaving ? 0.6 : 1,
                }}
              >
                {bulkSaving ? 'Application…' : `Appliquer à ${negotiableListings.length} articles`}
              </button>
              <button
                type="button"
                onClick={() => setShowBulk(false)}
                style={{
                  background: 'rgba(255,255,255,0.06)', color: '#aaa', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8, padding: '8px 16px', fontSize: 13, cursor: 'pointer',
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <p style={{ color: 'var(--color-text-secondary, #aaa)', fontSize: 13, textAlign: 'center', padding: 24 }}>
            Chargement de vos articles…
          </p>
        )}

        {/* Vide */}
        {!loading && listings.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <p style={{ fontSize: 40, margin: '0 0 8px' }}>📦</p>
            <p style={{ color: '#aaa', fontSize: 13 }}>Aucun article actif. Publiez des annonces pour configurer la boutique automatique.</p>
          </div>
        )}

        {/* Liste articles */}
        {!loading && negotiableListings.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {negotiableListings.map(listing => (
              <div key={listing.id} style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 10, padding: 14, transition: 'border-color 0.2s',
              }}>
                {/* Header article */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: editingId === listing.id ? 12 : 0 }}>
                  {listing.imageUrl && (
                    <img
                      src={listing.imageUrl}
                      alt=""
                      style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                      loading="lazy"
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {listing.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                      {listing.category} · {formatMoney(listing.priceUsdCents)}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 6, flexShrink: 0,
                    background: listing.autoNegoRules?.enabled ? 'rgba(76,175,80,0.15)' : 'rgba(255,255,255,0.06)',
                    color: listing.autoNegoRules?.enabled ? '#4caf50' : '#888',
                  }}>
                    {listing.autoNegoRules?.enabled ? '✅ Auto' : '⏸ Manuel'}
                  </span>

                  {/* Quick info */}
                  {listing.autoNegoRules && !listing.autoNegoRules.enabled ? null : listing.autoNegoRules && (
                    <span style={{ fontSize: 11, color: '#6f58ff', flexShrink: 0 }}>
                      {FIRMNESS_LABELS[listing.autoNegoRules.firmness]?.icon} {FIRMNESS_LABELS[listing.autoNegoRules.firmness]?.label}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => editingId === listing.id ? setEditingId(null) : openEdit(listing)}
                    style={{
                      background: 'rgba(111,88,255,0.1)', border: '1px solid rgba(111,88,255,0.2)',
                      borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#6f58ff',
                      cursor: 'pointer', flexShrink: 0,
                    }}
                  >
                    {editingId === listing.id ? '✕' : '⚙'}
                  </button>
                </div>

                {/* Edit panel */}
                {editingId === listing.id && (
                  <div style={{
                    background: 'rgba(111,88,255,0.04)', borderRadius: 8, padding: 12,
                    border: '1px solid rgba(111,88,255,0.1)',
                  }}>
                    <RulesForm rules={editRules} onChange={setEditRules} formatMoney={formatMoney} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button
                        type="button"
                        onClick={() => saveRules(listing.id)}
                        disabled={saving === listing.id}
                        style={{
                          background: '#6f58ff', color: '#fff', border: 'none', borderRadius: 8,
                          padding: '6px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          opacity: saving === listing.id ? 0.6 : 1,
                        }}
                      >
                        {saving === listing.id ? 'Sauvegarde…' : 'Sauvegarder'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        style={{
                          background: 'rgba(255,255,255,0.06)', color: '#aaa', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer',
                        }}
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Articles non négociables */}
        {!loading && listings.length > 0 && listings.length !== negotiableListings.length && (
          <p style={{ fontSize: 11, color: '#666', marginTop: 12 }}>
            {listings.length - negotiableListings.length} article(s) non négociable(s) — la boutique automatique ne s'applique qu'aux articles négociables.
          </p>
        )}
      </section>
    </div>
  );
}

/* ─── Sub-components ─── */

function StatCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? 'rgba(111,88,255,0.08)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${accent ? 'rgba(111,88,255,0.15)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 10, padding: '12px 14px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ? '#6f58ff' : '#fff' }}>{value}</div>
      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{label}</div>
    </div>
  );
}

function RulesForm({ rules, onChange, formatMoney }: {
  rules: AutoNegoRules;
  onChange: (r: AutoNegoRules) => void;
  formatMoney: (cents: number) => string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Activé */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={rules.enabled}
          onChange={e => onChange({ ...rules, enabled: e.target.checked })}
          style={{ accentColor: '#6f58ff' }}
        />
        <span style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>
          Activer la négociation automatique
        </span>
      </label>

      {rules.enabled && (
        <>
          {/* Prix plancher */}
          <div>
            <label style={{ fontSize: 12, color: '#aaa', display: 'block', marginBottom: 4 }}>
              Prix plancher minimum ({rules.minFloorPercent}% du prix affiché)
            </label>
            <input
              type="range" min={30} max={99} value={rules.minFloorPercent}
              onChange={e => onChange({ ...rules, minFloorPercent: Number(e.target.value) })}
              style={{ width: '100%', accentColor: '#6f58ff' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666' }}>
              <span>30% (-70%)</span>
              <span>99% (-1%)</span>
            </div>
          </div>

          {/* Remise max auto-accept */}
          <div>
            <label style={{ fontSize: 12, color: '#aaa', display: 'block', marginBottom: 4 }}>
              Remise max acceptée automatiquement ({rules.maxAutoDiscountPercent}%)
            </label>
            <input
              type="range" min={1} max={50} value={rules.maxAutoDiscountPercent}
              onChange={e => onChange({ ...rules, maxAutoDiscountPercent: Number(e.target.value) })}
              style={{ width: '100%', accentColor: '#6f58ff' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666' }}>
              <span>1%</span>
              <span>50%</span>
            </div>
          </div>

          {/* Contre-offre préférée */}
          <div>
            <label style={{ fontSize: 12, color: '#aaa', display: 'block', marginBottom: 4 }}>
              Contre-offre préférée ({rules.preferredCounterPercent}% du prix affiché)
            </label>
            <input
              type="range" min={50} max={99} value={rules.preferredCounterPercent}
              onChange={e => onChange({ ...rules, preferredCounterPercent: Number(e.target.value) })}
              style={{ width: '100%', accentColor: '#6f58ff' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666' }}>
              <span>50%</span>
              <span>99%</span>
            </div>
          </div>

          {/* Fermeté */}
          <div>
            <label style={{ fontSize: 12, color: '#aaa', display: 'block', marginBottom: 6 }}>
              Niveau de fermeté
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(["FLEXIBLE", "BALANCED", "FIRM"] as const).map(f => {
                const info = FIRMNESS_LABELS[f];
                const active = rules.firmness === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => onChange({ ...rules, firmness: f })}
                    style={{
                      flex: 1, padding: '8px 6px', borderRadius: 8, cursor: 'pointer',
                      background: active ? 'rgba(111,88,255,0.15)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${active ? 'rgba(111,88,255,0.3)' : 'rgba(255,255,255,0.08)'}`,
                      color: active ? '#6f58ff' : '#888', textAlign: 'center', fontSize: 12,
                    }}
                  >
                    <div style={{ fontSize: 16 }}>{info.icon}</div>
                    <div style={{ fontWeight: 600, marginTop: 2 }}>{info.label}</div>
                    <div style={{ fontSize: 10, marginTop: 2, color: active ? 'rgba(111,88,255,0.7)' : '#666' }}>
                      {info.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
