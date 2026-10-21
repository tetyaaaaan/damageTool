const test = require("node:test");
const assert = require("node:assert/strict");
const order = require("../../games/js/hsrCharacterOrder.js");

test("sorts latest releases first without mutating input and keeps unknowns stable at the end", () => {
  const input = [{ id: "1503" }, { id: "1001" }, { id: "not-in-catalog" }, { id: "1502" }, { id: "unknown" }];
  const result = order.sort(input);
  assert.deepEqual(result.map((item) => item.id), ["1503", "1502", "1001", "not-in-catalog", "unknown"]);
  assert.deepEqual(input.map((item) => item.id), ["1503", "1001", "not-in-catalog", "1502", "unknown"]);
  assert.notEqual(result, input);
});

test("puts later release phases first and preserves order for same-day releases", () => {
  const input = [{ id: "1102" }, { id: "1003" }, { id: "1101" }];
  assert.deepEqual(order.sort(input).map((item) => item.id), ["1102", "1003", "1101"]);
  const ids = (items) => order.sort(items).map((item) => item.id);
  assert.deepEqual(ids([{ id: "1212" }, { id: "1112" }, { id: "1210" }]), ["1112", "1210", "1212"]);
  assert.deepEqual(ids([{ id: "1220" }, { id: "1223" }, { id: "1222" }]), ["1222", "1220", "1223"]);
  assert.deepEqual(ids([{ id: "1506" }, { id: "1505" }, { id: "1504" }]), ["1505", "1506", "1504"]);
  assert.deepEqual(ids([{ id: "1510" }, { id: "1508" }, { id: "1509" }]), ["1508", "1509", "1510"]);
});
