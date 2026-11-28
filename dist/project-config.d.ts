export interface ArchitectureLayerConfig {
    namespaces: string[];
    mayDependOn: string[];
}
export interface ProjectToolkitConfig {
    /** Null means no usable architecture section; an empty layer map has no boundaries. */
    architecture: {
        layers: Record<string, ArchitectureLayerConfig>;
        exclude: string[];
    } | null;
    routing: {
        disableSkills: string[];
        extraSkills: string[];
    };
    verification: {
        composerScripts: Partial<Record<"tests" | "static" | "style", string>>;
    } | null;
}
export interface ProjectToolkitConfigResult {
    config: ProjectToolkitConfig;
    diagnostics: string[];
    present: boolean;
}
export declare function readProjectToolkitConfig(root: string): Promise<ProjectToolkitConfigResult>;
