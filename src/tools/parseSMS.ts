import nlp from 'compromise';
import crypto from 'crypto';

export function extractTransactionInfo(message: string) {
  let info: any = {};

  // Perform NLP analysis
  const doc = nlp(message);

  // Use compromise.js to extract information
  // Extracting amount
  const amountMatch: any = doc.match('#Money');
  if (amountMatch.found) {
    const amountTerm = amountMatch.terms().get(0);
    info.amount = amountTerm.value();
    info.currency = amountTerm.unit();
  }

  // Extracting date_time
  const dateMatch = doc.match('#Date');
  if (dateMatch.found) {
    info.date_time = dateMatch.text();
  }

  // Extracting payee/receiver/sender
  const personMatch = doc.match('(#Person|#Organization)');
  if (personMatch.found) {
    info.payee = personMatch.text();
  }

  // Extracting type of transaction (payment or receipt)
  const paymentKeywords = ['payment', 'sent', 'debit', 'transferred', 'auth'];
  const receiptKeywords = ['received', 'credited', 'deposit'];
  let transactionType = '';
  const words = doc.text().toLowerCase().split(/\s+/);
  for (const word of words) {
    if (paymentKeywords.includes(word)) {
      transactionType = 'expense';
      break;
    } else if (receiptKeywords.includes(word)) {
      transactionType = 'income';
      break;
    }
  }
  info.transaction_type = transactionType;

  const regexFees =
    /Fee was (\d+(?:,\d{3})*(?:\.\d+)?)\s*(RWF|Rwanda[n]* Francs?)/i;
  const regexFeesMatch = message.match(regexFees);
  if (regexFeesMatch) {
    info.fees = parseFloat(regexFeesMatch[1].replace(',', ''));
  }

  if (!info.fees) {
    const feeMatch: any = doc.match('(fee|charge|cost)[:s]*#Money');
    if (feeMatch.found) {
      const feeTerm = feeMatch.terms().get(0);
      info.fees = feeTerm.value();
    }
  }

  if (!info.fees) {
    const regexFees = /fee\s*was:\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*RWF/i;
    const regexFeesMatch = message.match(regexFees);

    if (regexFeesMatch) {
      info.fees = parseFloat(regexFeesMatch[1].replace(',', ''));
    }
  }

  if (!info.amount || !info.currency) {
    // Extracting amount using regex
    const amountRegex = /Amt: RWF (\d+(?:,\d+)*)/;
    const amountMatch = message.match(amountRegex);
    if (amountMatch) {
      info.amount = parseFloat(amountMatch[1].replace(',', ''));
    }
  }

  // If compromise.js didn't find a match, use regex as a backup
  if (!info.amount || !info.date_time || !info.payee || !info.fees) {
    const regexAmount =
      /(\d+(?:,\d{3})*(?:\.\d+)?)\s*(RWF|Rwanda[n]* Francs?)/i;
    const regexDate = /(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/;
    const regexPerson =
      /(from|to)\s+(.*?)(?= at|\.|\()|(to|from)\s+(.*?)(?= at|\.|\()/;
    const regexFees =
      /(?:fee?|charges?|cost):\s*(\d+(?:,\d{3})*(?:\.\d+)?)\s*(RWF|Rwanda[n]* Francs?)/i;

    const regexAmountMatch = message.match(regexAmount);
    const regexDateMatch = message.match(regexDate);
    const regexPersonMatch = message.match(regexPerson);
    const regexFeesMatch = message.match(regexFees);

    if (regexAmountMatch) {
      info.amount = parseFloat(regexAmountMatch[1].replace(',', ''));
      info.currency = regexAmountMatch[2];
    }
    if (regexDateMatch) {
      info.date_time = regexDateMatch[1];
    }
    if (regexPersonMatch) {
      info.payee = regexPersonMatch[2] || regexPersonMatch[5];
    }
    if (regexFeesMatch) {
      info.fees = parseFloat(regexFeesMatch[1].replace(',', ''));
    }
  }

  return info;
}

export function generateHash(sms: string) {
  return crypto.createHash('sha256').update(sms).digest('hex');
}
