/**
 * KsReco — re-exports de tous les composants de recommandations
 */
export {
  KsBanner,
  KsRecoCard,
  KsAdvisorPanel,
  KsAnalyticsCTA,
  KsBoostSuggest,
  KsUpgradeCard,
  KsTip,
} from "./KsReco";

export type {
  AccountVariant,
  KsRecoItem,
  KsBannerProps,
  KsRecoCardProps,
  KsAdviceItem,
  KsAdvisorPanelProps,
  KsAnalyticsCTAProps,
  KsBoostOption,
  KsBoostSuggestProps,
  KsUpgradeCardProps,
  KsTipProps,
} from "./KsReco";

// Moteur anti-spam
export {
  useRecoEngine,
  adviceToCandidates,
  nudgeToCandidates,
  clearRecoMemory,
} from "../../hooks/useRecoEngine";

export type {
  RecoType,
  RecoSlot,
  RecoCandidate,
  RecoResult,
  RecoEngineConfig,
} from "../../hooks/useRecoEngine";
