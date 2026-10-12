import { parseBankCsv } from "../src/lib/bank/csv";
import { parseMt940 } from "../src/lib/bank/mt940";
import { parseCamt053 } from "../src/lib/bank/camt053";

function check(naam: string, ok: boolean, info?: unknown) {
  if (!ok) { console.error("FOUT", naam, info); process.exit(1); }
  console.log("ok ", naam);
}

const ing = `"Datum","Naam / Omschrijving","Rekening","Tegenrekening","Code","Af Bij","Bedrag (EUR)","Mutatiesoort","Mededelingen"
"20260915","Klant BV","NL01INGB0001234567","NL02RABO0002","OV","Bij","1210,00","Overschrijving","Factuur 2026-0001"
"20260916","Vercel Inc","NL01INGB0001234567","","BA","Af","24,20","Betaalautomaat","Vercel Pro"`;
let r = parseBankCsv(ing);
check("ING", r.bank === "ING" && r.regels.length === 2 && r.regels[0].bedrag === 1210 && r.regels[1].bedrag === -24.2 && r.eigenIban === "NL01INGB0001234567", r);

const rabo = `"IBAN/BBAN","Munt","BIC","Volgnr","Datum","Rentedatum","Bedrag","Saldo na trn","Tegenrekening IBAN/BBAN","Naam tegenpartij","Naam uiteindelijke partij","Naam initiërende partij","BIC tegenpartij","Code","Batch ID","Transactiereferentie","Machtigingskenmerk","Incassant ID","Betalingskenmerk","Omschrijving-1","Omschrijving-2","Omschrijving-3","Reden retour","Oorspr bedrag","Oorspr munt","Koers"
"NL11RABO0123456789","EUR","RABONL2U","000000000000001","2026-09-10","2026-09-10","-45,10","+1.000,00","NL22ABNA0987654321","Albert Heijn","","","ABNANL2A","bg","","","","","","AH 1234 Amsterdam","","","","","",""`;
r = parseBankCsv(rabo);
check("Rabobank", r.bank === "Rabobank" && r.regels[0].bedrag === -45.1 && r.regels[0].tegenpartij === "Albert Heijn" && r.eigenIban === "NL11RABO0123456789", r);

const abn = `Rekeningnummer\tMuntsoort\tTransactiedatum\tRentedatum\tBeginsaldo\tEindsaldo\tTransactiebedrag\tOmschrijving
123456789\tEUR\t20260912\t20260912\t1000,00\t900,00\t-100,00\tSEPA Overboeking IBAN: NL33INGB0000000001 BIC: INGBNL2A Naam: Jansen Timmerwerk Omschrijving: Factuur 55`;
r = parseBankCsv(abn);
check("ABN AMRO", r.bank === "ABN AMRO" && r.regels[0].bedrag === -100 && /Jansen/.test(r.regels[0].tegenpartij) && r.regels[0].tegenIban === "NL33INGB0000000001", r);

const bunq = `Date,Interest Date,Amount,Account,Counterparty,Name,Description
2026-09-01,2026-09-01,"-12,50",NL44BUNQ2025123456,NL55INGB0000000002,Spotify,Spotify Premium`;
r = parseBankCsv(bunq);
check("bunq", r.bank === "bunq" && r.regels[0].bedrag === -12.5 && r.eigenIban === "NL44BUNQ2025123456", r);

const knab = `Rekeningnummer;Transactiedatum;Valutacode;CreditDebet;Bedrag;Tegenrekeningnummer;Tegenrekeninghouder;Valutadatum;Betaalwijze;Omschrijving;Type betaling;Machtigingsnummer;Incassant ID;Adres;Referentie;Boekdatum
NL66KNAB0255000000;10-09-2026;EUR;D;30,00;NL77RABO0000000003;KPN;10-09-2026;Incasso;Factuur sept;;;;;;10-09-2026`;
r = parseBankCsv(knab);
check("Knab", r.bank === "Knab" && r.regels[0].bedrag === -30 && r.regels[0].tegenpartij === "KPN", r);

const sns = `"08-09-2026","NL88SNSB0900000000","NL99INGB0000000004","Bol.com","","","","EUR","1000,00","EUR","250,00","08-09-2026","08-09-2026","1234","IC","Uitbetaling week 36","",""`;
r = parseBankCsv(sns);
check("SNS", r.bank === "SNS/ASN/RegioBank" && r.regels[0].bedrag === 250 && r.regels[0].tegenpartij === "Bol.com", r);

const triodos = `"Transactiedatum","Rekening","Bedrag","Debet/Credit","Naam","Tegenrekening","Omschrijving"
"05-09-2026","NL12TRIO0123456789","99,99","D","Coolblue","NL13INGB0000000005","Bestelling 1"`;
r = parseBankCsv(triodos);
check("Triodos", r.bank === "Triodos" && r.regels[0].bedrag === -99.99, r);

const revolut = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
CARD_PAYMENT,Current,2026-09-02 10:00:00,2026-09-03 10:00:00,Adobe,-24.19,0.00,EUR,COMPLETED,500.00`;
r = parseBankCsv(revolut);
check("Revolut", r.bank === "Revolut" && r.regels[0].bedrag === -24.19 && r.regels[0].tegenpartij === "Adobe", r);

const n26 = `"Booking Date","Value Date","Partner Name","Partner Iban","Type","Payment Reference","Account Name","Amount (EUR)","Original Amount","Original Currency","Exchange Rate"
"2026-09-04","2026-09-04","Klant X","NL14ABNA0000000006","Credit Transfer","Factuur 12","Main","500.00","","",""`;
r = parseBankCsv(n26);
check("N26", r.bank === "N26" && r.regels[0].bedrag === 500, r);

const generiek = `datum;bedrag;tegenpartij;omschrijving
2026-09-05;-10,00;Test;Iets`;
r = parseBankCsv(generiek);
check("generiek", r.regels[0].bedrag === -10, r);

const mt940 = `:20:STARTUMS
:25:NL01INGB0001234567EUR
:28C:1
:60F:C260901EUR1000,00
:61:2609020902D24,20NTRFNONREF//00000000001
:86:/TRTP/SEPA OVERBOEKING/IBAN/NL02RABO0000000002/BIC/RABONL2U/NAME/Vercel Inc/REMI/Vercel Pro sept/EREF/NOTPROVIDED
:61:2609030903C1210,00NTRFNONREF//00000000002
:86:/CNTP/NL03ABNA0000000003/ABNANL2A/Klant BV/Amsterdam//REMI/USTD//Factuur 2026-0001/
:62F:C260903EUR2185,80
-`;
const m = parseMt940(mt940);
check("MT940", m.eigenIban === "NL01INGB0001234567" && m.bank === "ING" && m.regels.length === 2 && m.regels[0].bedrag === -24.2 && m.regels[0].tegenpartij === "Vercel Inc" && m.regels[1].bedrag === 1210 && m.regels[1].tegenpartij === "Klant BV" && /Factuur 2026-0001/.test(m.regels[1].omschrijving), m);

const camt = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><GrpHdr><MsgId>1</MsgId></GrpHdr>
<Stmt><Id>1</Id><Acct><Id><IBAN>NL11RABO0123456789</IBAN></Id><Svcr><FinInstnId><BIC>RABONL2U</BIC></FinInstnId></Svcr></Acct>
<Ntry><Amt Ccy="EUR">45.10</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2026-09-10</Dt></BookgDt><AcctSvcrRef>ABC1</AcctSvcrRef>
<NtryDtls><TxDtls><RltdPties><Cdtr><Nm>Albert Heijn</Nm></Cdtr><CdtrAcct><Id><IBAN>NL22ABNA0987654321</IBAN></Id></CdtrAcct></RltdPties><RmtInf><Ustrd>AH 1234</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">1210.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2026-09-11</Dt></BookgDt><AcctSvcrRef>ABC2</AcctSvcrRef>
<NtryDtls><TxDtls><RltdPties><Dbtr><Nm>Klant BV</Nm></Dbtr><DbtrAcct><Id><IBAN>NL02RABO0000000002</IBAN></Id></DbtrAcct></RltdPties><RmtInf><Ustrd>Factuur 2026-0001</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
</Stmt></BkToCstmrStmt></Document>`;
const c = parseCamt053(camt);
check("CAMT.053", c.eigenIban === "NL11RABO0123456789" && c.bank === "Rabobank" && c.regels.length === 2 && c.regels[0].bedrag === -45.1 && c.regels[0].tegenpartij === "Albert Heijn" && c.regels[1].bedrag === 1210 && c.regels[1].tegenIban === "NL02RABO0000000002", c);


// Creditcard: ICS (puntkomma, Debet/Credit) en American Express (aankopen positief)
const ics = `Transactiedatum;Boekingsdatum;Omschrijving;Kaartnummer;Debet/Credit;Bedrag
12-09-2026;13-09-2026;BOL.COM UTRECHT;**** **** **** 4821;D;24,99
14-09-2026;15-09-2026;TERUGBETALING;**** **** **** 4821;C;10,00`;
const ri = parseBankCsv(ics);
check("ICS creditcard", ri.bank === "ICS creditcard" && ri.regels.length === 2 && ri.regels[0].bedrag === -24.99 && ri.regels[1].bedrag === 10 && ri.eigenIban === "CC-ICS-4821", ri);
const amex = `Datum,Omschrijving,Kaartlid,Rekening #,Bedrag
09/12/2026,ADOBE  *CREATIVE CLD,R DE VRIES,-71004,"65,99"`;
const ra = parseBankCsv(amex);
check("American Express", ra.bank === "American Express" && ra.regels.length === 1 && ra.regels[0].bedrag === -65.99 && ra.regels[0].tegenpartij === "ADOBE", ra);
console.log("PARSERS OK");
