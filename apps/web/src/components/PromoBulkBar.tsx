import type { FC } from 'react';

type PromoBulkBarProps = {
  count: number;
  label: string; // "article" | "produit" | "service"
  onDeselect: () => void;
  onPromo: () => void;
};

export const PromoBulkBar: FC<PromoBulkBarProps> = ({ count, label, onDeselect, onPromo }) => {
  if (count === 0) return null;
  const plural = count > 1 ? 's' : '';
  return (
    <div className="ud-art-bulk-bar">
      <div className="ud-art-bulk-left">
        <span className="ud-art-bulk-count">
          {count} {label}{plural} sélectionné{plural}
        </span>
        <button type="button" className="ud-art-bulk-deselect" onClick={onDeselect}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Tout désélectionner
        </button>
      </div>
      <button type="button" className="ud-art-bulk-cta" onClick={onPromo}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        Faire une promotion
      </button>
    </div>
  );
};
