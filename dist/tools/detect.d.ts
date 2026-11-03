export interface PhpProjectInfo {
    hasComposerJson: boolean;
    hasComposerLock: boolean;
    /** Set when composer.json exists but could not be read or parsed. */
    composerJsonError: string | null;
    phpRequirement: string | null;
    autoloadPsr4: Record<string, string>;
    require: Record<string, string>;
    requireDev: Record<string, string>;
    scripts: Record<string, string>;
    detectedTools: {
        phpunit: boolean;
        pest: boolean;
        phpstan: boolean;
        psalm: boolean;
        csFixer: boolean;
        phpcs: boolean;
        rector: boolean;
        mago: boolean;
        deptrac: boolean;
        infection: boolean;
    };
    /** Static-analysis/style-fixer config files present in the project root (just the file names). */
    configs: string[];
    /** composer.json `config.platform.php`, when pinned. */
    platformPhp: string | null;
    laravelHint: boolean;
    symfonyHint: boolean;
}
export declare function detectPhpProject(directory: string): Promise<PhpProjectInfo>;
export declare function formatDetection(info: PhpProjectInfo): string;
