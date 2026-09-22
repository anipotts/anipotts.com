import type { Icon } from "@phosphor-icons/react";
import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  CalendarDotsIcon,
  CheckCircleIcon,
  ClipboardTextIcon,
  ClockIcon,
  DatabaseIcon,
  GitCommitIcon,
  GithubLogoIcon,
  GlobeHemisphereWestIcon,
  LinkSimpleIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PlayCircleIcon,
  ShieldCheckIcon,
  UserIcon,
  XIcon,
} from "@phosphor-icons/react";
import type { SemanticReferenceKind } from "../data/semantic-reference";

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
  CheckCircleIcon,
  ClockIcon,
  DatabaseIcon,
  MagnifyingGlassIcon,
  XIcon,
};
