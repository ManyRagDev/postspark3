import re

with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "r") as f:
    content = f.read()

old_code = """            </Layer>
          </Stage>

          {/* ─── 10. OVERLAY DE EDIÇÃO DIRETA DE TEXTO NO PALCO (CANVAS INLINE EDITOR) ─── */}
          {editingTarget && (() => {"""

new_code = """            </Layer>
          </Stage>
        </div>

        {/* ─── 10. OVERLAY DE EDIÇÃO DIRETA DE TEXTO NO PALCO (CANVAS INLINE EDITOR) ─── */}
        {/* Container fora do "overflow-hidden" da prancheta, para que a barra flutuante de ferramentas não seja cortada pelo CSS */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            width: baseWidth,
            height: baseHeight,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
          }}
        >
          {editingTarget && (() => {"""

if old_code in content:
    content = content.replace(old_code, new_code)
    
    # Agora só falta fechar o div lá no final.
    # O final original:
    #             );
    #           })()}
    #         </div>
    #       </div>
    #     );
    # Esse primeiro </div> fechava o `rounded-[28px]`. Agora ele vai fechar o `absolute inset-0`.
    # A quantidade de </div> é a mesma, então o JSX não precisa de ajustes no fechamento final!
    
    with open("client/src/pages/CanvasLab/components/CanvasPostStage.tsx", "w") as f:
        f.write(content)
    print("Patch aplicado.")
else:
    print("Erro: old_code não encontrado.")
