import {describe,expect,it} from 'vitest';
import {createComponentDefinition} from '@shared/componentAssembly';
import {arsenalHash,contentCoverageIssues,readContentSource} from '@shared/arsenalContent';
import {createArsenalFixtureComposition} from '../CanvasLab/lib/arsenalFixture';
import {componentReviewContent} from './componentReview';
function fixture() {
  const c=createArsenalFixtureComposition();
  return createComponentDefinition({schemaVersion:1,id:crypto.randomUUID(),kind:'content',label:'Componente de teste',description:'Teste de capacidade',source:{kind:'catalog',versionId:c.origin.versionId,definitionHash:c.origin.definitionHash,variantKey:c.base.variantKey,variantHash:arsenalHash(c.base)},roles:['static'],densities:['balanced'],aspectRatios:[c.base.aspectRatio],fragment:c.base,pieces:c.pieces,assets:c.assets});
}
describe('concrete component review samples',()=>{
  it('uses the component own fields without recycling original demonstration copy',()=>{
    const c=fixture();const short=componentReviewContent(c,'curto'),long=componentReviewContent(c,'longo');
    expect(readContentSource(short,'headline')).toBe('Sua ideia merece uma boa forma');
    expect(String(readContentSource(long,'headline')).length).toBeGreaterThan(String(readContentSource(short,'headline')).length);
    expect(contentCoverageIssues(short,c.fragment.bindings)).toEqual([]);
  });
  it('preserves every literal word and exposes unsupported list/comparison capability',()=>{
    const c=fixture(),literal=componentReviewContent(c,'literal');
    expect(readContentSource(literal,'headline')).toBe('O texto literal precisa ser mantido exatamente como foi escrito.');
    expect(contentCoverageIssues(componentReviewContent(c,'lista'),c.fragment.bindings)).toEqual([]);
    expect(contentCoverageIssues(componentReviewContent(c,'comparação'),c.fragment.bindings).length).toBeGreaterThan(0);
  });
});
