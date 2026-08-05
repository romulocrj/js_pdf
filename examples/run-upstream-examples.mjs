/*
 * js_pdf runner for the ported dart_pdf examples.
 * Copyright (C) 2026, Romulo Campos
 * Licensed under the Apache License, Version 2.0.
 */

import { readFile, unlink, writeFile } from 'node:fs/promises';
import { generateCalendar } from './calendar.mjs';
import { generateCertificate } from './certificate.mjs';
import { generateDocument } from './document.mjs';
import { generateHelloWorld } from './hello-world.mjs';
import { generateInvoice } from './invoice.mjs';
import { generateReport } from './report.mjs';
import { generateResume } from './resume.mjs';
import { generateServer } from './server.mjs';

const asset = name => new URL(`./assets/${name}`, import.meta.url);
const text = name => readFile(asset(name), 'utf8');
const bytes = name => readFile(asset(name));

async function commonFonts() {
  return {
    openSans: await bytes('OpenSans-Regular.ttf'),
    openSansBold: await bytes('OpenSans-Bold.ttf')
  };
}

const examples = [
  {
    name: 'hello-world',
    generate: () => generateHelloWorld()
  },
  {
    name: 'calendar',
    generate: async () => generateCalendar(undefined, {
      ...await commonFonts(),
      calendarSvg: await text('calendar.svg')
    })
  },
  {
    name: 'certificate',
    generate: async () => generateCertificate(undefined, undefined, {
      libreBaskerville: await bytes('LibreBaskerville-Regular.ttf'),
      libreBaskervilleItalic: await bytes('LibreBaskerville-Italic.ttf'),
      libreBaskervilleBold: await bytes('LibreBaskerville-Bold.ttf'),
      robotoLight: await bytes('Roboto-Light.ttf'),
      medailSvg: await text('medail.svg'),
      swirlsSvg: await text('swirls.svg'),
      swirls1Svg: await text('swirls1.svg'),
      swirls2Svg: await text('swirls2.svg'),
      swirls3Svg: await text('swirls3.svg'),
      garlandSvg: await text('garland.svg')
    })
  },
  {
    name: 'document',
    generate: async () => generateDocument(undefined, undefined, {
      ...await commonFonts(),
      documentSvg: await text('document.svg'),
      swirls2Svg: await text('swirls2.svg')
    })
  },
  {
    name: 'invoice',
    generate: async () => generateInvoice(undefined, undefined, {
      roboto: await bytes('Roboto-Regular.ttf'),
      robotoBold: await bytes('Roboto-Bold.ttf'),
      robotoItalic: await bytes('Roboto-Italic.ttf'),
      logoSvg: await text('logo.svg'),
      invoiceSvg: await text('invoice.svg')
    })
  },
  {
    name: 'report',
    generate: async () => generateReport(undefined, undefined, await commonFonts())
  },
  {
    name: 'resume',
    generate: async () => generateResume(undefined, undefined, {
      ...await commonFonts(),
      materialIcons: await bytes('MaterialIcons.ttf'),
      profileJpg: await bytes('profile.jpg'),
      resumeSvg: await text('resume.svg')
    })
  },
  {
    name: 'server',
    generate: async () => {
      const svg = JSON.parse(await text('server-assets.json'));
      return generateServer(undefined, undefined, {
        pricingJson: await text('server-pricing.json'),
        metrophobic: await bytes('Metrophobic-Regular.ttf'),
        cpuSvg: svg.svgCpu,
        trafficSvg: svg.svgTraffic,
        bannerSvg: svg.svgBanner,
        ramSvg: svg.svgRam,
        logoSvg: svg.svgLogo,
        ssdSvg: svg.svgSsd,
        overSvg: svg.svgOver,
        bangSvg: svg.svgBang,
        netSvg: svg.svgNet,
        cpu1Svg: svg.svgCpu1
      });
    }
  }
];

const results = [];

for (const example of examples) {
  const output = new URL(`./${example.name}.pdf`, import.meta.url);
  await unlink(output).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });

  try {
    const generated = await example.generate();
    const pdfBytes = generated instanceof Uint8Array ? generated : new Uint8Array(generated);
    await writeFile(output, pdfBytes);
    results.push({ name: example.name, status: 'generated', bytes: pdfBytes.length });
    console.log(`GENERATED ${example.name}.pdf (${pdfBytes.length} bytes)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name: example.name, status: 'failed', error: message });
    console.error(`FAILED ${example.name}: ${message}`);
  }
}

await writeFile(
  new URL('./generation-results.json', import.meta.url),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`
);

if (results.some(result => result.status === 'failed')) process.exitCode = 1;
