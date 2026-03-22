(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.MonopolyRulePresets = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const DEFAULT_RULE_PRESET = 'capitalista_v2';

    const RULE_PRESETS = Object.freeze({
        capitalista_v2: Object.freeze({
            id: 'capitalista_v2',
            label: 'Capitalista V2',
            description: 'Capitalista-aligned board flow with map-specific theming overlays.',
            config: Object.freeze({
                requireFullSetForBuilding: true,
                requireEvenBuilding: false,
                requireEvenSelling: true,
                mortgageLocksColorGroupBuildings: true,
                bailoutCollectsTaxPool: true,
                goPassCash: 200,
                goLandCash: 400,
                jailExitOnDoublesEndsTurn: true,
                jailReleaseAfterThreeFailedRolls: true,
                loansEnabled: false,
                ownedPropertyOvertakeEnabled: false
            })
        })
    });

    function cloneRuleConfig(config = {}) {
        const cloned = { ...config };
        if (Array.isArray(config.loanOfferAmounts)) {
            cloned.loanOfferAmounts = [...config.loanOfferAmounts];
        }
        return cloned;
    }

    function resolveRulePreset(rulePresetId = DEFAULT_RULE_PRESET) {
        return RULE_PRESETS[rulePresetId] || RULE_PRESETS[DEFAULT_RULE_PRESET];
    }

    function normalizeRulesConfig(rulesConfig = {}, rulePresetId = DEFAULT_RULE_PRESET) {
        const preset = resolveRulePreset(rulePresetId);
        const merged = {
            ...cloneRuleConfig(preset.config),
            ...(rulesConfig && typeof rulesConfig === 'object' ? cloneRuleConfig(rulesConfig) : {})
        };

        merged.requireFullSetForBuilding = merged.requireFullSetForBuilding !== false;
        merged.requireEvenBuilding = merged.requireEvenBuilding === true;
        merged.requireEvenSelling = merged.requireEvenSelling !== false;
        merged.mortgageLocksColorGroupBuildings = merged.mortgageLocksColorGroupBuildings !== false;
        merged.bailoutCollectsTaxPool = merged.bailoutCollectsTaxPool !== false;
        merged.jailExitOnDoublesEndsTurn = merged.jailExitOnDoublesEndsTurn !== false;
        merged.jailReleaseAfterThreeFailedRolls = merged.jailReleaseAfterThreeFailedRolls !== false;
        merged.loansEnabled = Boolean(merged.loansEnabled);
        merged.ownedPropertyOvertakeEnabled = Boolean(merged.ownedPropertyOvertakeEnabled);
        merged.goPassCash = Number.isFinite(merged.goPassCash) ? merged.goPassCash : 200;
        merged.goLandCash = Number.isFinite(merged.goLandCash) ? merged.goLandCash : 400;

        return merged;
    }

    return {
        DEFAULT_RULE_PRESET,
        RULE_PRESETS,
        resolveRulePreset,
        normalizeRulesConfig,
        cloneRuleConfig
    };
});
