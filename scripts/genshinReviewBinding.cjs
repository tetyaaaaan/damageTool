"use strict";

const crypto = require("node:crypto");

const stableValue = (value) => Array.isArray(value)
    ? value.map(stableValue)
    : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
        : value;

function reviewSubject(record) {
    const subject = JSON.parse(JSON.stringify(record || null));
    if (subject && typeof subject === "object") {
        delete subject.verification;
        if (subject.targetSpec && typeof subject.targetSpec === "object") delete subject.targetSpec.verification;
    }
    return subject;
}

function reviewSubjectDigest(record) {
    return crypto.createHash("sha256").update(JSON.stringify(stableValue(reviewSubject(record)))).digest("hex");
}

function buildReviewBinding(record, decisionId) {
    return { algorithm: "sha256", subjectDigest: reviewSubjectDigest(record), decisionId };
}

function validateReviewBinding(record) {
    const binding = record?.verification?.reviewBinding;
    const expectedSubjectDigest = reviewSubjectDigest(record);
    const valid = binding?.algorithm === "sha256"
        && /^[a-f0-9]{64}$/.test(binding?.subjectDigest || "")
        && binding.subjectDigest === expectedSubjectDigest
        && typeof binding?.decisionId === "string" && binding.decisionId.length > 0;
    return { valid, expectedSubjectDigest };
}

module.exports = { buildReviewBinding, reviewSubject, reviewSubjectDigest, validateReviewBinding };
