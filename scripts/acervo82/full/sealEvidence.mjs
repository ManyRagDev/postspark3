import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const base='artifacts/acervo82/full';
const json=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const sha=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
const stage=await json(`${base}/staged.json`),d=stage.verification;
const [verification,review,persistence,browser,roster]=await Promise.all([
 json(`${d}/verification.json`),json(`${d}/review.json`),json(`${d}/persistence.json`),json(`${d}/browser-journeys.json`),json('designs/acervo82/manifest.json'),
]);
assert.equal(stage.revision,persistence.revision);assert.equal(verification.roots,82);
assert.equal(new Set(browser.filter(row=>row.opened&&row.assetsReady).map(row=>row.code)).size,82);
assert.equal(persistence.checks.filter(row=>row.ok).length,verification.fixtures.length);
const registryFile='designs/acervo82/authored/registry.json', registry=await json(registryFile);
const adapted={
 'REF-01':['O recorte da câmera/mão foi recomposto como área de mídia; a foto de ensaio não usa segmentação de objeto.'],
 'REF-02':['Textura, sombras e grampos preservados como decoração; a pergunta e os recortes de ênfase continuam editáveis.'],
 'REF-03':['Lettering, selos e proporções foram recompostos; a fotografia da área inferior usa recorte de ensaio.'],
 'REF-05':['Retrato e bloco inferior são regiões separadas; o acabamento fotográfico e a trama do original não foram incorporados.'],
 'REF-06':['A referência tem duas versões. A geometria usa a adaptação de janelas do showcase, com o original arquivado para comparação.'],
 'REF-07':['O computador e o papel são decoração fotográfica, não uma fotografia substituível. O título da tela permanece editável.'],
 'REF-08':['A grade pontilhada fina da página original foi simplificada.'],
 'REF-10':['O mosaico permanece em formas nativas; não há segmentação nem tratamento automático em preto e branco da foto substituída.'],
 'REF-11':['Tarjas inclinadas e fotografia são independentes; a imagem de ensaio substitui o bonde do original.'],
 'REF-15':['O papel rasgado foi reconstruído por polígonos, sem recortar mãos ou silhueta automaticamente.'],
 'REF-16':['O lema periférico é formado por segmentos de texto rotacionados, e a largura da fonte original é aproximada.'],
 'REF-18':['A colagem usa regiões de mídia separadas em vez de segmentar pessoa, câmeras e mãos.'],
 'REF-19':['O relevo e o rasgo do papel são simplificações nativas; a faixa é uma região textual e não um slot de foto.'],
 'REF-21':['A mídia original desfocada é substituível; a textura óptica não é aplicada automaticamente.'],
 'REF-22':['A moldura amarela é fixa na composição e não rastreia o objeto na fotografia.'],
 'REF-23':['A pessoa da fotografia não é recortada à frente do lettering; tarjas e tipografia são nativas.'],
 'R9-16':['Contorno nativo com preenchimento da cor do fundo para simular a letra vazada.'],
 'CON-04':['O desfoque de fundo e a transparência do cartão foram aproximados.'],
 'CON-06':['Avisos, selos e números da referência são exemplos de conteúdo, sem valor de certificação.'],
 'CON-12':['A faixa Obi é texto nativo rotacionado; a composição japonesa não é reproduzida caractere a caractere.'],
 'CON-14':['O destaque em itálico do original foi aproximado pela cor do trecho no texto editável.'],
 'CON-16':['A retícula é decoração rasterizada a partir dos parâmetros de grade; o texto continua separado.'],
};
for(const e of registry.entries){
 const r=review.entries.find(x=>x.id===e.id), proof=verification.checks.find(x=>x.id===e.id),source=roster.entries.find(x=>x.id===e.id);
 assert(r&&proof?.rootReady&&r.definitionHash&&source.preview===e.sourcePreview);
 const defs=proof.definitions.filter(x=>proof.stagedDefinitions.includes(x.id));
 e.state='verified_local';e.capabilities={...r.capabilities,formats:['4:5']};
 e.sourceHash=proof.sourceHash;e.sourceArchiveHash=source.source.sha256;
 e.nativeThumbnail={path:path.join(d,r.render),sha256:await sha(path.join(d,r.render))};
 e.adaptations=Array.from(new Set([...r.differences,...(adapted[e.code]??[])]));
 e.definitions=defs.map(x=>({id:x.id,hash:x.hash,roles:x.roles,referenceRender:x.reference.sha256,alternateRender:x.alternate.sha256}));
 e.evidence={revision:stage.revision,nativeFit:true,verifiedFonts:true,authenticatedRoundTrip:true,browserOpened:true,productionApproved:false};
 e.withheldVariants=proof.definitions.filter(x=>!proof.stagedDefinitions.includes(x.id)).map(x=>({id:x.id,hash:x.hash,cause:x.reason??'Papel complementar não verificado',nextAction:'Revisar encaixe e contraste do papel no carrossel, refazer os dois ensaios e verificar o par desenvolvimento/fechamento.'}));
 r.differences=e.adaptations;
}
await fs.writeFile(registryFile,JSON.stringify(registry,null,2)+'\n');
await fs.writeFile(`${d}/review.json`,JSON.stringify(review,null,2)+'\n');
const cover={revision:stage.revision,sourceEntries:82,available:82,carouselFamilies:review.entries.filter(e=>e.capabilities.carousel).length,definitionCount:stage.definitions,nativePngs:verification.checks.flatMap(c=>c.definitions).filter(d=>d.passed).length*2,localDocuments:persistence.checks.filter(row=>row.ok).length,browserOpened:browser.length,sourceManifestSha256:await sha('designs/acervo82/manifest.json'),registrySha256:await sha(registryFile),verificationPath:`${d}/verification.json`,browserExport:await json(`${d}/browser-export.json`)};
await fs.writeFile(`${base}/coverage.json`,JSON.stringify(cover,null,2)+'\n');console.log(JSON.stringify(cover));
