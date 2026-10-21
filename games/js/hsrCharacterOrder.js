(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HsrCharacterOrder = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // Version-to-character mapping compiled from the community-maintained release history.
  // https://honkai-star-rail.fandom.com/wiki/Character/Change_History
  // Japanese update history includes character releases and banner dates by phase:
  // https://wikiwiki.jp/star-rail/%E3%82%A2%E3%83%83%E3%83%97%E3%83%87%E3%83%BC%E3%83%88%E5%B1%A5%E6%AD%B4
  const VERSION_BY_ID = Object.freeze({
    "8001":"1.0","8002":"1.0","8003":"1.0","8004":"1.0",
    "8005":"2.2","8006":"2.2","8007":"3.0","8008":"3.0","8009":"4.2","8010":"4.2",
    "1001":"1.0","1002":"1.0","1003":"1.0","1004":"1.0","1005":"1.2","1006":"1.1","1008":"1.0","1009":"1.0","1013":"1.0","1014":"3.4","1015":"3.4",
    "1101":"1.0","1102":"1.0","1103":"1.0","1104":"1.0","1105":"1.0","1106":"1.0","1107":"1.0","1108":"1.0","1109":"1.0","1110":"1.3","1111":"1.2","1112":"1.4",
    "1201":"1.0","1202":"1.0","1203":"1.1","1204":"1.0","1205":"1.2","1206":"1.0","1207":"1.1","1208":"1.3","1209":"1.0","1210":"1.4","1211":"1.0","1212":"1.4","1213":"1.3","1214":"1.6","1215":"1.5","1217":"1.5","1218":"2.4","1220":"2.5","1221":"2.4","1222":"2.5","1223":"2.5","1224":"2.4","1225":"2.7",
    "1301":"2.1","1302":"1.5","1303":"1.6","1304":"2.1","1305":"1.6","1306":"2.0","1307":"2.0","1308":"2.1","1309":"2.2","1310":"2.3","1312":"2.0","1313":"2.7","1314":"2.3","1315":"2.2","1317":"2.6","1321":"3.8",
    "1401":"3.0","1402":"3.0","1403":"3.1","1404":"3.1","1405":"3.2","1406":"3.3","1407":"3.2","1408":"3.4","1409":"3.3","1410":"3.5","1412":"3.5","1413":"3.6","1414":"3.6","1415":"3.7",
    "1501":"4.0","1502":"4.0","1503":"4.6","1504":"4.1","1505":"4.2","1506":"4.2","1507":"4.3","1508":"4.4","1509":"4.4","1510":"4.4","1512":"4.5","1513":"4.5"
  });
  const VERSION_ORDER = Object.freeze(["1.0","1.1","1.2","1.3","1.4","1.5","1.6","2.0","2.1","2.2","2.3","2.4","2.5","2.6","2.7","3.0","3.1","3.2","3.3","3.4","3.5","3.6","3.7","3.8","4.0","4.1","4.2","4.3","4.4","4.5","4.6"]);
  // Later release batches sort first within a version. Ties are same-day releases
  // and preserve the incoming catalog order. Ranks follow the phase/date rows in
  // the update-history source above; same-day ties are intentionally not invented.
  const PHASE_BY_ID = Object.freeze({
    "1204":2,
    "1203":2,"1207":2,"1006":1,
    "1005":2,"1111":2,"1205":1,
    "1208":2,"1110":2,"1213":1,
    "1112":2,"1210":2,"1212":1,
    "1215":2,"1302":2,"1217":1,
    "1305":2,"1214":1,"1303":1,
    "1306":2,"1312":1,"1307":1,
    "1304":2,"1301":2,"1308":1,
    "1315":2,"1309":1,"8005":1,"8006":1,
    "1314":2,"1310":1,
    "1221":1,"1218":2,"1224":1,
    "1222":2,"1220":1,"1223":1,
    "1313":1,"1225":2,
    "1401":1,"8007":1,"8008":1,"1402":2,
    "1403":1,"1404":2,
    "1407":1,"1405":2,
    "1409":1,"1406":2,
    "1408":1,"1014":2,"1015":2,
    "1410":1,"1412":2,
    "1413":1,"1414":2,
    "1502":1,"1501":2,
    "1506":1,"8009":1,"8010":1,"1505":2,
    "1510":1,"1508":2,"1509":2,
    "1512":1,"1513":2
  });
  const UNKNOWN_IDS = Object.freeze([]);
  const rank = new Map(VERSION_ORDER.map((version, index) => [version, index]));

  function sort(characters) {
    return (Array.isArray(characters) ? characters : [])
      .map((character, index) => ({ character, index, version: VERSION_BY_ID[String(character?.id ?? "")] }))
      .sort((a, b) => {
        const ar = rank.get(a.version);
        const br = rank.get(b.version);
        if (ar === undefined && br === undefined) return a.index - b.index;
        if (ar === undefined) return 1;
        if (br === undefined) return -1;
        return br - ar || (PHASE_BY_ID[String(b.character?.id ?? "")] || 0) - (PHASE_BY_ID[String(a.character?.id ?? "")] || 0) || a.index - b.index;
      })
      .map(({ character }) => character);
  }

  return Object.freeze({ sort, versionById: VERSION_BY_ID, phaseById: PHASE_BY_ID, unknownIds: UNKNOWN_IDS });
});
