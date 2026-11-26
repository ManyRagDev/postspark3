"""Gera o comparativo local a partir dos recibos congelados, sem acesso à rede."""
from collections import Counter, defaultdict
from html import escape
from pathlib import Path
import json
import gzip
import os

root = Path(os.environ["DESIGN_FIT_OUTPUT"])
track = Path(".conductor/tracks/018-validacao-propostas-selecionadas")


def read(path):
    return json.loads(path.read_bytes())


def link(path, label):
    assert (root / path).is_file(), path
    return f'<a href="{escape(str(path), quote=True)}">{escape(str(label))}</a>'


def table(headings, rows):
    header = ''.join(f'<th>{escape(h)}</th>' for h in headings)
    body = ''.join('<tr>' + ''.join(f'<td>{cell}</td>' for cell in row) + '</tr>' for row in rows)
    return f'<div class="scroll"><table><thead><tr>{header}</tr></thead><tbody>{body}</tbody></table></div>'


def family(key):
    return key.removeprefix("acervo82-").replace("reference-", "REF-").replace("concept-", "CON-").upper()


def figure(label, path):
    return f'<figure>{link(path, label)}<a href="{path}"><img src="{path}" alt="{escape(label)}" loading="lazy"></a></figure>'


def proposals(plan):
    return [offer["family"] for offer in plan["offers"]]


ranks = read(root / "classificacoes.json")
assessments = read(root / "avaliacoes.json")
profiles = read(root / "fichas.json")
verdicts = {v["par"]: v for v in read(track / "parecer-cego.json")}
billing = {r["id"]: r["receipt"]["debitedSparks"] for r in read(root / "sparks-diagnostico.json")}
controls = read(root / "controle.json")
source_briefs = {
    c["request"]: json.loads(gzip.decompress((root / "recibos" / (c["request"]+".json.gz")).read_bytes()))["r"]["input"]["content"]
    for c in controls
}
paired = read(Path(".conductor/tracks/015-controle-selecao-design/pares.json"))
pair_briefs = {c["id"]: group["facts"]+" "+c["ask"] for group in paired["groups"] for c in group["cases"]}
names = {2: "Oficina Vira-Chave", 7: "Pátio 13", 10: "Mãos de Barro"}
body = ['<h1>Seleção de designs por briefing</h1>',
        '<p>A capa candidata do Pátio 13 reuniu preço, período e benefício em dois cartões empilhados. Entregou sete propostas, tantas quanto o controle, e completou menos pedidos. Em Mãos de Barro, o controle venceu as três comparações. A evidência favorece manter a política vigente.</p>',
        table(['Três pedidos por braço', 'Controle A', 'Candidato B'], [
            ['Propostas prontas', '7/9 · 23 páginas', '7/9 · 22 páginas'],
            ['Pedidos com três propostas', '2/3', '1/3'],
            ['Família inicial mantida entre as prontas', '3/7', '7/7'],
            ['Preferências cegas em oito pares com reutilização de peças', '5', '3'],
            ['Chamadas de redação, reparo e revisão', '33', '28'],
            ['USD informado nessas chamadas', '0,0353718 + 2 sem valor', '0,0316642 + 1 sem valor'],
            ['Sparks em liquidação isolada', '66', '66']
        ]),
        '<p><a href="#artes">Pareceres e artes</a> · <a href="#execucoes">Pedidos, custos e reaberturas</a> · <a href="#ranking">Notas, regras e reservas</a> · <a href="#controle">Controle histórico</a></p>',
        '<h2 id="artes">Pareceres e artes</h2><p>Um revisor recebeu os briefings e os PNGs X/Y em ordem alternada, com possibilidade de empate. A origem foi revelada depois. Há seis pares com a mesma posição e dois entre as primeiras posições que entregaram. Dois PNGs participam de mais de um par. Clique na imagem para ler todas as páginas no tamanho renderizado.</p>']
for row in read(root / "origens.json"):
    key = row["key"]
    if key.endswith("-1"):
        brief = source_briefs[controls[row["sourceRound"]-1]["request"]]
        body.append("<blockquote>"+escape(brief)+"</blockquote>")
    verdict = verdicts[key]
    winner = verdict["preferencia"]
    same = row['X']['slot'] == row['Y']['slot']
    body.append(f'<h3>{names[row["sourceRound"]]} · {key} · preferência {winner} ({row[winner]["arm"]})</h3>')
    body.append('<p>' + ('Mesma posição.' if same else 'Primeira posição que entregou em cada braço.') + ' ' + escape(verdict["parecer"]) + '</p>')
    body.append('<div class="pair">' + ''.join(figure(f'{label} · {row[label]["arm"]} · {family(row[label]["family"])} · proposta {1+row[label]["slot"]}', f'cego/{key}-{label}.png') for label in ['X', 'Y']) + '</div>')

body.extend(['<h2 id="execucoes">Execuções de ponta a ponta em diagnóstico</h2>',
             '<p>O clique em Retomar solicitação no TheVoid acionou o worker e a redação, reparo e revisão reais. Preparação, eleição e catálogo estavam congelados. A aplicação compilada usou transporte tRPC, identidade e armazenamento isolados. O cronômetro vai da admissão à galeria com todas as entregas. A nova abertura dos recibos finais, em outro navegador, conferiu origem e quantidade de páginas nas 14 propostas. Seus tempos de replay ficam fora da comparação.</p>',
             '<p>Oficina A exigiu retomada. O primeiro piloto usou um cache de imagens incompleto e exibiu uma reserva antiga na primeira abertura da galeria. A retomada verificou os 53 assets, recuperou a redação e a revisão necessárias e entregou CON-20. A galeria e as cópias finais foram reconferidas em replay limpo. Os custos incluem o piloto. Para o tempo, compare somente Pátio e Mãos de Barro.</p>'])
catalog = {read(f)['id']: read(f).get('completeDesign', {}).get('family', '') for f in (root/'definicoes').glob('*.json')}
for n in names:
    for arm in ['A', 'B']:
        directory = Path(f'geracoes/{n}-{arm}')
        run = read(root / directory / 'final.json')
        phases = read(root / directory / 'jornada.json')
        verification = read(root / directory / 'reabertura/jornada.json')
        plan = read(root / f'plano-{n}-{arm}.json')
        wires = [read(f) for f in (root/directory).glob('wire-*.json')]
        ops = [read(f) for f in (root/directory).glob('op-*.json')]
        saved = {}
        for post in (root/directory/'reabertura').glob('salvo-*.json'):
            model = read(post)['canvas_model']
            saved[model['provenance']['journey']['proposalId']] = post.stem.split('-')[1]
        stages = defaultdict(list)
        for wire in wires:
            attempt, stage, *_ = wire['key'].split(':')
            if '-fb' in attempt and stage == 'copy':
                stage = 'copy (reserva)'
            stages[stage].append(wire)
        body.append(f'<h3>{names[n]} · {arm}</h3><p>Pedido {link(directory/"admissao.json",run["id"])} · origem histórica {escape(run["source"])} · galeria {phases["elapsedMs"]/1000:.3f} s · {billing[run["id"]]} Sparks.</p>')
        body.append('<p>'+' · '.join([link(directory/'final.json','Snapshot do worker'),link(directory/'jornada.json','Cronologia original'),link(directory/'reabertura/galeria.png','Galeria final verificada'),link(directory/'reabertura/jornada.json','Reaberturas verificadas')])+'</p>')
        rows = []
        for idx, slot in enumerate(run['snapshot']['proposals']):
            initial = proposals(plan)[idx]
            recovered = [o for o in ops if o['operationKey'].startswith(slot['proposalId']+':delivery_recovery:') and o['result'].get('plan')]
            # The first key omits the attempt number. Numbered keys start at 2.
            recovered.sort(key=lambda o: int(o['operationKey'].split(':')[2]) if o['operationKey'].split(':')[2].isdigit() else 1)
            reserves = [family(catalog[o['result']['plan']['pages'][0]['componentId']])+' ('+o['result']['mode']+')' for o in recovered]
            bundle = slot.get('bundle')
            if bundle:
                saved_id = saved[slot['proposalId']]
                result = link(f'artes/{n}-{arm}-{idx+1}.png', family(bundle['family'])) + f' · {len(bundle["slides"])} pág.'
                reopening = link(directory/f'reabertura/reaberto-{saved_id}.png','CanvasLab')
            else:
                result = escape(slot['failure']['stage']+' / '+slot['failure']['code'])
                reopening = '—'
            diagnostics = Counter(d.get('code') or d.get('rule') for d in slot['diagnostics']+slot['findings'])
            calls = Counter()
            for wire in wires:
                attempt, stage, *_ = wire['key'].split(':')
                if attempt == slot['proposalId'] or attempt.startswith(slot['proposalId']+'-fb'):
                    calls[('reserva ' if '-fb' in attempt else 'inicial ') + stage] += 1
            by_position = ', '.join(f'{escape(k)} ×{v}' for k,v in sorted(calls.items()))
            rows.append([str(idx+1),family(initial),by_position, ', '.join(reserves) or '—', result, ', '.join(f'{escape(k)} ×{v}' for k,v in diagnostics.items()) or '—', reopening])
        body.append(table(['Proposta','Inicial','Chamadas por tentativa','Reservas tentadas','Entrega','Achados finais','Reabertura'],rows))
        cost_rows=[]
        for stage,group in sorted(stages.items()):
            costs=[w['response'].get('usage',{}).get('cost') for w in group]
            cost_rows.append([stage,str(len(group)),f'{sum(c for c in costs if c is not None):.7f}',str(costs.count(None))])
        body.append(table(['Etapa','Chamadas','USD informado','Sem valor'],cost_rows))
        assert verification['ready']==len(saved) and not verification['errors']

body.extend(['<h2 id="ranking">Notas, regras e reservas</h2>',
             '<p>A usa a ficha compacta v5. B acrescenta evidência dos campos nativos. Cada lote tem 20 famílias. A regra específica soma 0,35 quando a utilidade efetiva atinge 2,6, a confiança atinge 0,45 e a ficha documenta a capacidade pedida. A ablação histórica soma 0,25 × n/(n+5) × (efetiva − média anterior) com o mesmo piso. A regra principal usa peso histórico zero. A diversidade acrescenta 0,25 × distância na terceira proposta. A recência desconta 0,10. A adequação ajustada e a semente resolvem empates.</p>',
             '<p>As fichas alteraram 26 de 30 posições históricas e 12 de 18 posições pareadas. Sobre B, o bônus específico mudou zero das 48 posições. O JEV devolve nota e confiança. As funções abaixo vêm da definição e o comparativo mostra a diferença numérica, sem inferir a justificativa privada do avaliador.</p>'])
by_case={(m['case'],m['arm']):m for m in assessments}
for case in ranks:
    body.append(f'<details><summary>{escape(case["id"])} · {escape(case["set"])} · {escape(case["source"])}</summary>')
    body.append('<p>'+escape(pair_briefs.get(case['id'],source_briefs[case['source']]))+'</p>')
    eval_rows=[]
    for arm in ['A','B']:
        item=by_case[case['id'],arm]
        usage=item['usage']
        eval_rows.append([arm,escape(item['id']),str(item['bytes']),f'{usage["input_tokens"]} / {usage["output_tokens"]}',f'{usage["cost"]:.9f}',f'{item["latencyMs"]:.1f}',f'<code>{item["payloadHash"]}</code>'])
    body.append(table(['Ficha','Resposta JEV','Bytes','Tokens E/S','USD','ms','SHA-256 do lote'],eval_rows))
    for policy, report in case['reports'].items():
        body.append(f'<details><summary>{escape(policy)} · {report["ms"]:.2f} ms · '+', '.join(family(s['top'][0]['family']) for s in report['slots'])+'</summary>')
        for idx,slot in enumerate(report['slots'],1):
            rows=[]
            for rank,top in enumerate(slot['top'],1):
                proof=profiles[top['family']]['evidence']
                rows.append([str(rank),family(top['family']),f'{top["raw"]:.2f} / {top["confidence"]:.2f}', f'{top["effective"]:.4f}', f'{top["specific"]:+.2f}',f'{top["historical"]:+.4f} (n={top["n"]})', f'{0.25*top["distance"]:+.3f}', '-0.10' if top['recent'] else '0',f'{top["final"]:.4f}',escape(', '.join(proof['functions']))])
            body.append(f'<h4>Proposta {idx} · diferença {slot["top"][0]["final"]-slot["top"][1]["final"]:.4f}</h4>')
            body.append(table(['Pos.','Família','Nota/conf.','Efetiva','Bônus','Histórico','Divers.','Recência','Final','Função na ficha'],rows))
            body.append('<p>Pedido específico detectado: '+escape(report['required'] or 'nenhum')+'. Reservas em ordem: '+', '.join(map(family,slot['reserves']))+'.</p>')
        body.append('</details>')
    body.append('</details>')

body.append('<h2 id="controle">Dez pedidos históricos</h2>')
body.append(table(['Rodada','Pedido e recibo','Elegíveis','Avaliadas','Iniciais','Prontas','Chamadas'], [
    [str(i),link('recibos/'+c['request']+'.json.gz',c['request']),str(len(c['eligible'])),str(len(c['assessed'])),
     ', '.join(family(s['initial']) for s in c['slots']),', '.join(family(s['delivered']) if s['delivered'] else '—' for s in c['slots']),str(c['calls'])] for i,c in enumerate(controls,1)]))
body.append('<p>'+ ' · '.join(link(file,label) for file,label in [
    ('controle.json','Seeds, hashes, componentes e reservas'),('fichas.json','82 fichas'),
    ('avaliacoes.json','32 recibos de avaliação'),('classificacoes.json','Todas as classificações'),
    ('calibracao.json','Calibração'),('parametros.json','Parâmetros congelados'),('origens.json','Chave cega'),
    ('sparks-diagnostico.json','Sparks isolados'),('sparks-historicos.json','Sparks históricos'),
    ('worker-fonte.tar.gz','Fonte congelada do worker')])+'</p>')
style = """
:root{font:17px/1.55 system-ui,sans-serif;color:#172d2b;background:#fcfcf9}body{max-width:1150px;margin:auto;padding:3vw}
h1,h2,h3{line-height:1.15}h1{font-size:2.5rem}h2{margin-top:3rem;border-top:2px solid;padding-top:1rem}
h3{margin-top:2rem}a{color:#095b67}p{max-width:86ch}.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.88rem}
th,td{text-align:left;border-bottom:1px solid #c7d2cb;padding:.5rem;vertical-align:top}th{background:#e9f0ec}
summary{padding:.6rem;cursor:pointer;font-weight:600}details{border:1px solid #c7d2cb;margin:.5rem 0;padding:.3rem}
details details{margin:.5rem}code{overflow-wrap:anywhere}.pair{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
figure{margin:0}figure img{display:block;width:100%;margin-top:.4rem} @media(max-width:700px){.pair{grid-template-columns:1fr}body{padding:1rem}}
"""
(root/'comparacao.html').write_text('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PostSpark — Seleção por briefing</title><style>'+style+'</style><main>'+''.join(body)+'</main></html>',encoding='utf-8')
