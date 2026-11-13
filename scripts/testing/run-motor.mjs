import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url));
const tests=[
 'server/ai/workflows/demandExecutor.test.ts',
 'server/ai/workflows/demandSession.test.ts',
 'server/_core/brandCaptureRoutes.test.ts',
 'server/ai/workflows/demandExecutor.postgres.test.ts',
 'server/ai/workflows/workerReadiness.test.ts',
 'server/ai/workflows/providerCooldown.test.ts',
 'server/ai/workflows/providerCooldown.runtime.test.ts',
 'server/brandCapture.admission.test.ts',
 'server/ai/workflows/generationResourceMetrics.test.ts',
 'server/ai/workflows/generationReconciliation.test.ts',
 'server/ai/workflows/generationPreparationRecovery.postgres.test.ts',
 'server/ai/workflows/generationProviderRejection.postgres.test.ts',
 'server/ai/workflows/generationPlanning.test.ts',
 'server/ai/workflows/generationEditorialIntegration.test.ts',
 'server/ai/workflows/proposalGraph.test.ts',
 'server/ai/workflows/capabilityMedia.test.ts',
 'server/designCatalog/designShortlist.test.ts',
 'server/designCatalog/capabilityTransport.test.ts',
 'shared/capabilitySelection.test.ts',
 'server/routers/generationTelemetry.postgres.test.ts',
 'client/src/lib/generationTelemetry.test.ts',
 'server/postRevision.postgres.test.ts',
 'server/db.snapshot.test.ts',
 'server/_core/networkDiagnostics.test.ts',
];
const env={...process.env,NODE_OPTIONS:`${process.env.NODE_OPTIONS??''} --require=${JSON.stringify(join(root,'scripts/testing/block-network.cjs'))}`};
const r=spawnSync(process.execPath,[join(root,'node_modules/vitest/vitest.mjs'),'run','--maxWorkers=2','--minWorkers=1',...tests],{cwd:root,env,stdio:'inherit'});
if(r.error)throw r.error;
process.exitCode=r.status??1;
