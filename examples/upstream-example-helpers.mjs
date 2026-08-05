/*
 * js_pdf helpers for ports of the original dart_pdf examples.
 * Copyright (C) 2017, David PHAM-VAN
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

export function requireFeatures(api, example, features) {
  const missing = features.filter(feature => api[feature] == null);
  if (missing.length) {
    throw new Error(`${example} requires unported js_pdf APIs: ${missing.join(', ')}`);
  }
}

export const customData = Object.freeze({
  name: '[your name]',
  testing: false
});
