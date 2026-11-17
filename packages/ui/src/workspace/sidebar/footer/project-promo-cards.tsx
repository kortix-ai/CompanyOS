'use client';

import { ComputerPromoSlide, useComputerPromoDismissed } from './project-computer-nav';
import { useMcpPromo } from './project-mcp-nav';
import { PromoSwitcher, type PromoSlide } from './promo-card';

import { useTranslations } from '../../../i18n';

/**
 * The sidebar's promo card: Kortix in the chat apps people already use, then
 * their own computer, one at a time in one card. Each slide is dismissed on
 * its own; the computer slide also leaves once a machine is paired. With no
 * slide left, nothing renders.
 */
export function ProjectPromoCards({
  projectId,
  onOpenMcp,
  onOpenComputer,
}: {
  projectId: string;
  onOpenMcp: () => void;
  onOpenComputer: () => void;
}) {
  const t = useTranslations('sidebar');
  const mcp = useMcpPromo(onOpenMcp);
  const [computerDismissed, dismissComputer] = useComputerPromoDismissed();
  const render = (computer: PromoSlide | null) => (
    <PromoSwitcher
      label={t('promos')}
      slides={[mcp, computer].filter((slide): slide is PromoSlide => slide !== null)}
    />
  );
  if (computerDismissed) return render(null);
  return (
    <ComputerPromoSlide projectId={projectId} onOpenConnect={onOpenComputer} onDismiss={dismissComputer}>
      {render}
    </ComputerPromoSlide>
  );
}
