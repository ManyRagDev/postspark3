const fs = require('fs');
const file = 'client/src/components/views/WorkbenchRefactored.tsx';
let content = fs.readFileSync(file, 'utf8');

// Normalize line endings to avoid \r\n vs \n issues
content = content.replace(/\r\n/g, '\n');

// 1. Remove from renderImageSection
const imageAdvancedStart = '    <AnimatePresence>\n      {isArchitect && (';
const imageAdvancedEnd = '      </AnimatePresence>\n    </div>\n  );';

const imageAdvancedStartIndex = content.indexOf('    <AnimatePresence>\n      {isArchitect && (');
const imageAdvancedEndIndex = content.indexOf('      </AnimatePresence>', imageAdvancedStartIndex) + '      </AnimatePresence>'.length;

const imageAdvancedContent = content.substring(imageAdvancedStartIndex, imageAdvancedEndIndex);
content = content.replace(imageAdvancedContent, '');

// 2. Remove from renderCompositionSection
const compAdvancedStartIndex = content.indexOf('    {/* FIX Bug 2:');
const compEndWrapIndex = content.indexOf('    </div>\n  );\n\n  // ========== LAYOUT PRINCIPAL ==========');

if (compAdvancedStartIndex === -1 || compEndWrapIndex === -1) {
  console.log("Could not find comp block start: " + compAdvancedStartIndex + " end: " + compEndWrapIndex);
  process.exit(1);
}

const compAdvancedContent = content.substring(compAdvancedStartIndex, compEndWrapIndex);
content = content.replace(compAdvancedContent, '');

// 3. Create renderAdvancedSection
let processedImageAdvanced = imageAdvancedContent
  .replace('    <AnimatePresence>\n      {isArchitect && (\n        <motion.div\n          initial={{ opacity: 0, height: 0 }}\n          animate={{ opacity: 1, height: \'auto\' }}\n          exit={{ opacity: 0, height: 0 }}\n          className="space-y-2 overflow-hidden"\n        >\n', '')
  .replace('        </motion.div>\n      )}\n    </AnimatePresence>', '');

let processedCompAdvanced = compAdvancedContent
  .replace('    {/* FIX Bug 2: Seções de controle sempre visíveis, não só no modo Arquiteto */}\n    <div className="space-y-3 pt-1">\n', '');

const renderAdvancedSection = `  const renderAdvancedSection = () => {
    if (!isArchitect) return null;
    return (
      <div className="space-y-4">
        {/* Ajuste Fino de Imagem */}
        <div className="pt-2">
          <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block font-semibold flex items-center gap-1.5 border-b border-white/5 pb-2">
            <Settings size={11} className="text-[#a855f7]" /> Calibração Visual (Imagem)
          </label>
          <div className="space-y-2 mt-3">
${processedImageAdvanced}
          </div>
        </div>

        {/* Ajuste Fino de Elementos */}
        <div className="pt-2 mt-4">
          <label className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider mb-2 block font-semibold flex items-center gap-1.5 border-b border-white/5 pb-2">
            <Layers size={11} className="text-[#a855f7]" /> Ajuste Fino de Elementos
          </label>
          <div className="space-y-3 mt-3">
${processedCompAdvanced}
        </div>
      </div>
    );
  };

`;

content = content.replace('  // ========== LAYOUT PRINCIPAL ==========', renderAdvancedSection + '  // ========== LAYOUT PRINCIPAL ==========');

// 4. Update sidebar
const sidebarSearch = `<CollapsibleSection
          title="Layout"`;
const sidebarInsert = `        {isArchitect && (
          <CollapsibleSection
            title="Arquiteto"
            icon={<Settings size={16} />}
            isExpanded={expandedSection === 'advanced'}
            onToggle={() => toggleSection('advanced')}
            accentColor={accentColor}
          >
            {renderAdvancedSection()}
          </CollapsibleSection>
        )}

        <CollapsibleSection
          title="Layout"`;
content = content.replace(sidebarSearch, sidebarInsert);

// 5. Update Mobile tabs
const mobileTabSearch = `              { id: 'composition' as TabId, Icon: Layout, label: 'Layout' },\n            ].map(({ id, Icon, label }) => (`;
const mobileTabInsert = `              { id: 'composition' as TabId, Icon: Layout, label: 'Layout' },\n              ...(isArchitect ? [{ id: 'advanced' as TabId, Icon: Settings, label: 'Avançado' }] : []),\n            ].map(({ id, Icon, label }) => (`;
content = content.replace(mobileTabSearch, mobileTabInsert);

// 6. Update Mobile Sheet render logic
const mobileSheetSearch = `{expandedSection === 'composition' && renderCompositionSection()}`;
const mobileSheetInsert = `{expandedSection === 'composition' && renderCompositionSection()}
              {expandedSection === 'advanced' && renderAdvancedSection()}`;
content = content.replace(mobileSheetSearch, mobileSheetInsert);

// 7. Update Mobile title
const activeTabLabelSearch = `expandedSection === 'composition' ? 'Composição Vertical' : ''`;
const activeTabLabelInsert = `expandedSection === 'composition' ? 'Composição Vertical' :
                    expandedSection === 'advanced' ? 'Ajuste Fino Arquiteto' : ''`;
content = content.replace(activeTabLabelSearch, activeTabLabelInsert);

fs.writeFileSync(file, content, 'utf8');
console.log('Refactor complete');
