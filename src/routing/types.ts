export const INTENTS = ["Build", "Design", "Review", "Debug", "Test", "Maintain"] as const;
export const CONCERNS = [
  "Architecture",
  "Design patterns",
  "Security",
  "Coding standards",
  "Testing",
  "Dependencies",
  "Static analysis",
  "Debugging",
] as const;
export type Intent = (typeof INTENTS)[number];
export type Concern = (typeof CONCERNS)[number];
export type Target = Intent | Concern;
export type Priority = number;
export type MaintainSubtype = "modernization" | "dependency" | "refactor";
export type Confidence = "high" | "medium" | "low";
export type SkillUnactivatedStatus = "pending" | "awaiting-approval" | "denied";
export type VerificationStatus = "passed" | "failed" | "partial" | "unavailable" | "error";

export interface ClassificationResult {
  intents: Intent[];
  concerns: Concern[];
  scores: Record<Target, number>;
  maintainSubtype: MaintainSubtype | null;
  frameworkContext: string[];
  phpContext: boolean;
  questionForm: boolean;
  reasonCodes: string[];
}

export interface PreviousTask {
  generation: number;
  intents: Intent[];
  concerns: Concern[];
}

export interface UnactivatedSkill {
  id: string;
  attempts: number;
  status: SkillUnactivatedStatus;
  reason: string;
}

export interface SessionRoutingState {
  sessionID: string;
  projectRoot: string;
  projectSubpath: string | null;
  projectFingerprint: string;
  projectLockFingerprint: string | null;
  taskGeneration: number;
  taskStartedAt: number;
  previousTask: PreviousTask | null;
  activeIntents: Intent[];
  activeConcerns: Concern[];
  selectedSkills: string[];
  attachedSkills: string[];
  activatedSkills: Set<string>;
  unactivatedSkills: UnactivatedSkill[];
  droppedSkills: Array<{ id: string; reason: string }>;
  mode: "risk" | "strict" | "off";
  lastPromptAt: number;
  lastAnnouncement: string | null;
  verification: {
    lastRunAt: string | null;
    status: VerificationStatus | null;
    failedChecks: string[];
  };
}

export interface StoredSessionRoutingState extends Omit<SessionRoutingState, "activatedSkills"> {
  schemaVersion: 1;
  activatedSkills: string[];
}
