import { DependencyExplanation, Explanation } from '@npmcli/arborist';

export interface PackageJson {
    name: string;
    version: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    [key: string]: any;
}

export interface DependencyExplanationWithFrom extends Omit<DependencyExplanation, 'from'> {
    from?: Explanation & { dependent?: DependencyExplanationWithFrom };
}
export interface ERESOLVErrorInfo {
    code: 'ERESOLV';
    current: Explanation;
    currentEdge: DependencyExplanationWithFrom | null;
    edge: DependencyExplanationWithFrom;
    strictPeerDeps: boolean;
    force: boolean;
}
