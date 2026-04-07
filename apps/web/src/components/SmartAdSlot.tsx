type SmartAdSlotProps = {
  pageKey: string;
  componentKey: string;
  variant?: 'banner' | 'card' | 'inline' | 'popup' | 'sidebar';
  className?: string;
};

export function SmartAdSlot({ pageKey, componentKey, variant = 'banner', className }: SmartAdSlotProps) {
  void pageKey;
  void componentKey;
  void variant;
  void className;
  return null;
}
