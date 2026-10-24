import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { outputScale, resolveOutputProfile } from '../archify/renderers/shared/output-profile.mjs';

const skillRoot = fileURLToPath(new URL('../archify/', import.meta.url));
const cli = path.join(skillRoot, 'bin/archify.mjs');
const examples = [
  ['architecture', 'web-app.architecture.json'],
  ['workflow', 'agent-tool-call.workflow.json'],
  ['sequence', 'cache-miss-request.sequence.json'],
  ['dataflow', 'product-analytics.dataflow.json'],
  ['lifecycle', 'agent-run.lifecycle.json'],
  ['erd', 'orders.erd.json'],
  ['tree', 'payment-platform.tree.json'],
  ['class', 'payments.class.json'],
  ['timeline', 'payment-incident.timeline.json'],
  ['waterfall', 'checkout-request.waterfall.json'],
];

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'archify-output-profile-'));
}

function withProfile(file, outputProfile, extraMeta = {}) {
  const doc = JSON.parse(fs.readFileSync(path.join(skillRoot, 'examples', file), 'utf8'));
  doc.meta = { ...doc.meta, ...extraMeta };
  if (outputProfile === undefined) delete doc.meta.output_profile;
  else doc.meta.output_profile = outputProfile;
  return doc;
}

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function writeDoc(dir, name, doc) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(doc));
  return file;
}

function svgRoot(html) {
  return html.match(/<svg viewBox[^>]*>/)?.[0] || '';
}

test('output profile: every diagram type accepts and stamps a slide or print profile', () => {
  const dir = tempDir();
  for (const [type, file] of examples) {
    for (const profile of [{ medium: 'slide' }, { medium: 'print', column_mm: 120, max_height_mm: 180 }]) {
      const input = writeDoc(dir, `${type}-${profile.medium}.json`, withProfile(file, profile));
      const out = path.join(dir, `${type}-${profile.medium}.html`);
      const result = run(['render', type, input, out, '--quality', 'standard']);
      assert.equal(result.status, 0, `${type} ${profile.medium}: ${result.stderr}`);
      const root = svgRoot(fs.readFileSync(out, 'utf8'));
      assert.match(root, new RegExp(`data-output-medium="${profile.medium}"`), type);
      assert.match(root, /data-output-frame="[\d.]+ [\d.]+"/, type);
      assert.match(root, /data-output-floor="[\d.]+ [\d.]+"/, type);
    }
  }
});

test('output profile: invalid profiles are schema errors', () => {
  const dir = tempDir();
  const invalid = [
    { medium: 'poster' },
    { medium: 'slide', column_mm: 160 },
    { medium: 'print', column_mm: 20 },
    { medium: 'print', max_height_mm: 1000 },
    { column_mm: 160 },
  ];
  for (const profile of invalid) {
    const input = writeDoc(dir, 'invalid.json', withProfile('agent-run.lifecycle.json', profile));
    const result = run(['validate', 'lifecycle', input, '--json']);
    assert.notEqual(result.status, 0, JSON.stringify(profile));
  }
});

test('output profile: a document without one renders without profile attributes or check', () => {
  const dir = tempDir();
  const input = writeDoc(dir, 'plain.json', withProfile('agent-run.lifecycle.json', undefined, { quality_profile: 'showcase' }));
  const out = path.join(dir, 'plain.html');
  assert.equal(run(['render', 'lifecycle', input, out, '--quality', 'showcase']).status, 0);
  assert.doesNotMatch(svgRoot(fs.readFileSync(out, 'utf8')), /data-output-/);
  const receipt = JSON.parse(run(['validate', 'lifecycle', input, '--quality', 'showcase', '--json']).stdout);
  assert.equal(JSON.stringify(receipt).includes('output_final_type'), false);
});

test('output profile: showcase reports text below the print floor at final size as warnings', () => {
  const dir = tempDir();
  const input = writeDoc(dir, 'print.json', withProfile('agent-run.lifecycle.json', { medium: 'print' }, { quality_profile: 'showcase' }));
  const result = run(['validate', 'lifecycle', input, '--quality', 'showcase', '--json']);
  assert.equal(result.status, 0, result.stdout);
  const receipt = JSON.parse(result.stdout);
  const issues = receipt.composition.issues.filter((entry) => entry.code === 'output/final-type-below-floor');
  assert.ok(issues.length > 0);
  assert.ok(issues.every((entry) => entry.severity === 'warning'));
  const [first] = issues;
  assert.equal(first.medium, 'print');
  assert.equal(first.unit, 'pt');
  assert.ok(first.finalSize < first.floor);
  assert.ok(first.text.length > 0);
  assert.ok(issues.some((entry) => entry.owner.kind === 'legend'), 'legend text is measured and owned');
  assert.equal(receipt.composition.outputFinalType.belowFloor, issues.length);
});

test('output profile: standard reports the same text as warnings without failing', () => {
  const dir = tempDir();
  const input = writeDoc(dir, 'print.json', withProfile('agent-run.lifecycle.json', { medium: 'print' }, { quality_profile: 'standard' }));
  const result = run(['validate', 'lifecycle', input, '--quality', 'standard', '--json']);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /output\/final-type-below-floor/);
});

test('output profile: the slide fit scale never exceeds its maximum and print never enlarges', () => {
  const slide = resolveOutputProfile({ output_profile: { medium: 'slide' } });
  assert.deepEqual(slide.frame, { width: 1760, height: 920 });
  assert.equal(outputScale(slide, 400, 200), 2);
  assert.equal(outputScale(slide, 3520, 920), 0.5);
  const print = resolveOutputProfile({ output_profile: { medium: 'print', column_mm: 160 } });
  assert.equal(print.frame.width, 453.54);
  assert.equal(outputScale(print, 200, 100), 1);
  assert.equal(Math.round(outputScale(print, 907.08, 300) * 1000) / 1000, 0.5);
  assert.equal(resolveOutputProfile({}), null);
});
