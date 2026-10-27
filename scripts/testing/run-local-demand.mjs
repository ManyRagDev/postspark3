import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const tests=[
 'server/ai/workflows/localDemand.postgres.test.ts',
 'server/ai/workflows/localDemandSupervisor.test.ts',
 'server/ai/workflows/localGenerationWorker.test.ts',
 'server/ai/workflows/generationWorkerMode.test.ts',
 'server/ai/workflows/generationRuntime.test.ts',
 'server/ai/workflows/generationJournalTrace.test.ts',
 'server/ai/workflows/generationStore.test.ts',
 'server/ai/workflows/generationBilling.postgres.test.ts',
 'server/designCatalog/versionedCatalog.test.ts',
 'server/designCatalog/completeDesignStore.test.ts',
 'server/designCatalog/catalogCoverage.test.ts',
 'server/_core/generationStream.test.ts',
 'server/_core/localAuthDiagnostic.test.ts',
 'server/_core/networkDiagnostics.test.ts',
 'server/_core/networkReport.test.ts',
 'server/ai/localDiagnostics.test.ts',
 'server/routers/generation.test.ts',
 'server/ai/generationTrace.test.ts',
 'server/ai/componentTextMeasurer.test.ts',
 'server/ai/workflows/proposalRenderer.test.ts',
 'server/post.test.ts',
 'client/src/_core/hooks/useAuth.test.tsx',
 'client/src/_core/hooks/useAuth.integration.test.tsx',
 'client/src/lib/authBridge.test.ts',
 'client/src/lib/localNetworkDiagnostics.test.ts',
 'client/src/components/auth/GoogleAuthCallback.test.tsx',
 'client/src/lib/catalogCache.test.ts',
 'client/src/hooks/useGenerationEvents.test.tsx',
 'client/src/pages/SavedPosts.test.tsx',
 'client/src/pages/StudioApp/StudioAppV2BPage.generation.test.tsx',
 'client/src/pages/StudioApp/StudioAppV2BPage.persistence.test.tsx',
 'client/src/pages/StudioApp/StudioAppV2BPage.saveIntent.test.tsx',
 'client/src/pages/CanvasLab/lib/saveAdapter.test.ts',
 'client/src/pages/CanvasLab/CanvasLabPage.persistence.test.tsx',
 'client/src/pages/CanvasLab/CanvasLabPage.export.test.tsx',
 'client/src/pages/CanvasLab/components/CanvasPostStage.export.test.tsx',
];
const env={...process.env,NODE_OPTIONS:`${process.env.NODE_OPTIONS??''} --require=${JSON.stringify(join(root,'scripts/testing/block-network.cjs'))}`};
for(const args of [tests,['--config','harness/completeDesigns/vitest.config.ts','harness/completeDesigns/publishCarouselSets.test.ts']]){
 const result=spawnSync(process.execPath,[join(root,'node_modules/vitest/vitest.mjs'),'run','--maxWorkers=4','--minWorkers=1',...args],{cwd:root,env,stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status??1);
}
