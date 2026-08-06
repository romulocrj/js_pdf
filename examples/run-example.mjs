/*
 * js_pdf example runner.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 *
 * This runner is Node-specific on purpose: it only supplies input data and
 * writes the resulting bytes to disk. create-sales-report.mjs itself stays
 * host-free. Run `npm run example`.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { createSalesReport } from './create-sales-report.mjs';

const model = {
  author: 'Blunana',
  period: 'January through July 2026',
  revenue: 185430.40,
  orders: 1248,
  averageTicket: 148.58,
  months: [
    { label: 'Jan', value: 21000 },
    { label: 'Feb', value: 24000 },
    { label: 'Mar', value: 23000 },
    { label: 'Apr', value: 28000 },
    { label: 'May', value: 27000 },
    { label: 'Jun', value: 31000 },
    { label: 'Jul', value: 31430 }
  ],
  sales: Array.from({ length: 35 }, (_, index) => ({
    date: `07/${String((index % 28) + 1).padStart(2, '0')}/2026`,
    customer: `Customer ${index + 1}`,
    status: index % 4 === 0 ? 'Pending' : 'Paid',
    value: 95.5 + index * 13.75
  }))
};

const bytes = createSalesReport(model);
const outputDirectory = new URL('./out/', import.meta.url);
await mkdir(outputDirectory, { recursive: true });
await writeFile(new URL('sales-report.pdf', outputDirectory), bytes);
console.log(`Generated out/sales-report.pdf (${bytes.length} bytes)`);
