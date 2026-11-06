export type ProjectType = "application" | "library" | "unknown";
export type Confidence = "high" | "medium" | "low";
export type FrameworkHint = "laravel" | "symfony" | "wordpress" | "none";
export interface ProjectProfile {
    root: string;
    subpath: string | null;
    type: ProjectType;
    typeConfidence: Confidence;
    typeEvidence: string[];
    phpRequirement: string | null;
    hasComposerJson: boolean;
    hasComposerLock: boolean;
    autoloadPsr4: Record<string, string>;
    packageName: string | null;
    packageType: string | null;
    frameworkHints: FrameworkHint[];
    tools: {
        phpunit: boolean;
        psalm: boolean;
        pest: boolean;
        phpstan: boolean;
        phpcs: boolean;
        csFixer: boolean;
        rector: boolean;
        deptrac: boolean;
        infection: boolean;
    };
    configFiles: {
        phpunit: string | null;
        pest: string | null;
        phpstan: string | null;
        psalm: string | null;
        phpcs: string | null;
        csFixer: string | null;
        deptrac: string | null;
        architecture: string | null;
    };
    layout: {
        sourceRoots: string[];
        testRoots: string[];
        hasPublicIndex: boolean;
        hasConsoleBin: boolean;
        hasMigrations: boolean;
        hasConfigDir: boolean;
        hasTemplates: boolean;
    };
    fingerprint: string;
    lockFingerprint: string | null;
}
export declare function buildProjectProfile(root: string, subpath: string | null): Promise<ProjectProfile>;
export declare class ProjectProfileCache {
    #private;
    get size(): number;
    resolve(root: string, subpath: string | null): Promise<ProjectProfile>;
    clear(): void;
}
