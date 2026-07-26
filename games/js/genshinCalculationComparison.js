(function () {
    "use strict";

    const STORAGE_KEY = "tetinet.genshin.calculationBaseline.v1";
    const MODES = new Set(["previous", "baseline"]);

    function clone(value) {
        return value == null ? null : JSON.parse(JSON.stringify(value));
    }

    function validSnapshot(snapshot) {
        return Boolean(
            snapshot
            && snapshot.schemaVersion === 1
            && snapshot.request
            && Array.isArray(snapshot.results)
        );
    }

    function readStoredBaseline(storage) {
        if (!storage) return null;
        try {
            const snapshot = JSON.parse(storage.getItem(STORAGE_KEY) || "null");
            return validSnapshot(snapshot) ? snapshot : null;
        } catch (_error) {
            return null;
        }
    }

    function writeStoredBaseline(storage, snapshot) {
        if (!storage) return;
        try {
            if (snapshot) storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
            else storage.removeItem(STORAGE_KEY);
        } catch (_error) {
            // Storage can be unavailable in private mode. Comparison still works in memory.
        }
    }

    function buildResultMap(snapshot) {
        return new Map((snapshot?.results || []).map((result) => [result.attackKey, result]));
    }

    function calculateDelta(currentValue, referenceValue) {
        const current = Number(currentValue);
        const reference = Number(referenceValue);
        if (!Number.isFinite(current) || !Number.isFinite(reference)) return null;
        const difference = current - reference;
        return {
            current,
            reference,
            difference,
            percent: reference === 0 ? null : difference / Math.abs(reference) * 100,
            direction: difference > 0 ? "up" : difference < 0 ? "down" : "same"
        };
    }

    function compareSnapshots(currentSnapshot, referenceSnapshot) {
        if (!validSnapshot(currentSnapshot) || !validSnapshot(referenceSnapshot)) return new Map();
        const references = buildResultMap(referenceSnapshot);
        return new Map(currentSnapshot.results.map((current) => {
            const reference = references.get(current.attackKey);
            if (!reference) return [current.attackKey, null];
            return [current.attackKey, {
                nonCrit: calculateDelta(current.nonCrit, reference.nonCrit),
                crit: calculateDelta(current.crit, reference.crit),
                expected: calculateDelta(current.expected, reference.expected),
                total: {
                    nonCrit: calculateDelta(current.total?.nonCrit, reference.total?.nonCrit),
                    crit: calculateDelta(current.total?.crit, reference.total?.crit),
                    expected: calculateDelta(current.total?.expected, reference.total?.expected)
                }
            }];
        }));
    }

    function createComparisonStore(storage) {
        const state = {
            current: null,
            previous: null,
            baseline: readStoredBaseline(storage),
            mode: "previous"
        };

        return {
            record(snapshot) {
                if (!validSnapshot(snapshot)) return this.getState();
                if (state.current) state.previous = state.current;
                state.current = clone(snapshot);
                return this.getState();
            },
            setMode(mode) {
                if (MODES.has(mode)) state.mode = mode;
                return state.mode;
            },
            setBaseline(snapshot = state.current) {
                if (!validSnapshot(snapshot)) return null;
                state.baseline = clone(snapshot);
                writeStoredBaseline(storage, state.baseline);
                return clone(state.baseline);
            },
            clearBaseline() {
                state.baseline = null;
                writeStoredBaseline(storage, null);
            },
            getReference(mode = state.mode) {
                return clone(mode === "baseline" ? state.baseline : state.previous);
            },
            getComparison(mode = state.mode) {
                return compareSnapshots(state.current, mode === "baseline" ? state.baseline : state.previous);
            },
            getState() {
                return {
                    mode: state.mode,
                    current: clone(state.current),
                    previous: clone(state.previous),
                    baseline: clone(state.baseline)
                };
            }
        };
    }

    const storage = (() => {
        try {
            return window.localStorage;
        } catch (_error) {
            return null;
        }
    })();

    window.GenshinCalculationComparison = {
        STORAGE_KEY,
        validSnapshot,
        calculateDelta,
        compareSnapshots,
        createComparisonStore,
        store: createComparisonStore(storage)
    };
})();
