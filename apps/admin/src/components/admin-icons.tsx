import type { Icon } from "@phosphor-icons/react";
import {
  ArticleIcon,
  ArrowRightIcon,
  ArrowSquareOutIcon,
  ArrowsClockwiseIcon,
  BriefcaseIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  CalendarDotsIcon,
  CaretDownIcon,
  CheckCircleIcon,
  CirclesFourIcon,
  ClipboardTextIcon,
  ClockIcon,
  DatabaseIcon,
  DesktopTowerIcon,
  EyeIcon,
  GitCommitIcon,
  GithubLogoIcon,
  GlobeHemisphereWestIcon,
  HeartIcon,
  LinkSimpleIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  MoonIcon,
  PlayCircleIcon,
  QuestionIcon,
  ShieldCheckIcon,
  StopIcon,
  SunIcon,
  TrendUpIcon,
  UserIcon,
  XIcon,
} from "@phosphor-icons/react";
import type {
  ActivationGraphLayer,
  OperationalProjection,
} from "../data/activation-graph";
import type { AdminInboxCategory } from "../data/inbox";
import type { SemanticReferenceKind } from "../data/semantic-reference";

export const iconForOperationalProjection: Record<OperationalProjection, Icon> =
  {
    ready: CheckCircleIcon,
    running: ArrowsClockwiseIcon,
    waiting: ClockIcon,
    blocked: StopIcon,
    "needs-ani": QuestionIcon,
    "recently-completed": CheckCircleIcon,
  };

export const iconForGraphLayer: Record<ActivationGraphLayer, Icon> = {
  world: GlobeHemisphereWestIcon,
  obligation: ClipboardTextIcon,
  execution: PlayCircleIcon,
  trajectory: TrendUpIcon,
};

export const iconForInboxCategory: Record<AdminInboxCategory, Icon> = {
  work: BriefcaseIcon,
  content: ArticleIcon,
  life: HeartIcon,
  fleet: DesktopTowerIcon,
  system: CirclesFourIcon,
};

export const iconForSemanticReference: Record<SemanticReferenceKind, Icon> = {
  calendar_event: CalendarBlankIcon,
  deadline: CalendarDotsIcon,
  date_range: CalendarBlankIcon,
  source_time: ClockIcon,
  recurrence: ArrowsClockwiseIcon,
  person: UserIcon,
  organization: BuildingsIcon,
  location: MapPinIcon,
  source: DatabaseIcon,
  evidence: ClipboardTextIcon,
  proof: ShieldCheckIcon,
  repository: GithubLogoIcon,
  commit: GitCommitIcon,
  task: ClipboardTextIcon,
  run: PlayCircleIcon,
  graph_entity: GlobeHemisphereWestIcon,
  route: LinkSimpleIcon,
};

export {
  ArrowRightIcon,
  ArrowSquareOutIcon,
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CheckCircleIcon,
  ClockIcon,
  DatabaseIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  StopIcon,
  SunIcon,
  XIcon,
};
