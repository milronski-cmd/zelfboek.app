/** Testversie: de vlag werkt alleen buiten het echte domein. */
import assert from "node:assert/strict";
import { testmodus } from "../src/lib/testmodus";

const zet = (vlag?: string, url?: string) => {
  if (vlag === undefined) delete process.env.SALDOPLAN_TESTMODUS; else process.env.SALDOPLAN_TESTMODUS = vlag;
  if (url === undefined) delete process.env.NEXT_PUBLIC_APP_URL; else process.env.NEXT_PUBLIC_APP_URL = url;
};
const fout = console.error;
console.error = () => undefined;
zet(undefined, "https://saldoplan-test.vercel.app"); assert.equal(testmodus(), false, "zonder vlag uit");
zet("0", "https://saldoplan-test.vercel.app"); assert.equal(testmodus(), false, "vlag 0 is uit");
zet("1", "https://saldoplan-test.vercel.app"); assert.equal(testmodus(), true, "vlag aan op testadres");
zet("1", "https://app.saldoplan.nl"); assert.equal(testmodus(), false, "nooit op het echte domein");
zet("1", "https://APP.saldoplan.nl/"); assert.equal(testmodus(), false, "ook niet met hoofdletters");
console.error = fout;
zet(undefined, undefined);
console.log("TESTMODUS OK");
