import { XMLParser } from 'fast-xml-parser';
import {
  messageLocation,
  type SourceMessage,
} from './strategies/sourceMessages';
import { parseXml } from './xml/node';
import {
  child,
  childAt,
  isList,
  type XmlList,
  type XmlNode,
  type XmlRead,
} from './xml/tree';

export interface ParsedCheckRunResult {
  success: boolean;
  status: string;
  message: string;
  errors: SourceMessage[];
  warnings: SourceMessage[];
  info: SourceMessage[];
  total_messages: number;
  has_errors: boolean;
  has_warnings: boolean;
}

/** A check run's document parsed: `response.data`, the document's text. */
export function parseCheckRunResponse(response: {
  data: string;
}): ParsedCheckRunResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
  });

  try {
    const result: XmlRead = parseXml(parser, response.data);

    const checkReport =
      childAt(result, 'chkrun:checkRunReports', 'chkrun:checkReport') ??
      childAt(result, 'checkRunReports', 'checkReport') ??
      child(result, 'chkrun:checkReport') ??
      child(result, 'checkReport');

    if (!checkReport) {
      return {
        success: true,
        status: 'no_report',
        message: 'No check report in response (no issues reported)',
        errors: [],
        warnings: [],
        info: [],
        total_messages: 0,
        has_errors: false,
        has_warnings: false,
      };
    }

    const status = String(
      child(checkReport, '@_chkrun:status') ||
        child(checkReport, 'chkrun:status') ||
        child(checkReport, '@_status') ||
        child(checkReport, 'status') ||
        'unknown',
    );

    const statusText = String(
      child(checkReport, 'chkrun:statusText') ||
        child(checkReport, '@_chkrun:statusText') ||
        child(checkReport, 'statusText') ||
        child(checkReport, '@_statusText') ||
        '',
    );

    const messages =
      childAt(checkReport, 'chkrun:checkMessageList', 'chkrun:checkMessage') ??
      childAt(checkReport, 'checkMessageList', 'checkMessage') ??
      childAt(checkReport, 'chkrun:messages', 'msg') ??
      childAt(checkReport, 'messages', 'msg') ??
      child(checkReport, 'chkrun:messages') ??
      child(checkReport, 'messages');

    const messageArray = isList(messages)
      ? messages
      : messages
        ? [messages]
        : [];

    const errors: ParsedCheckRunResult['errors'] = [];
    const warnings: ParsedCheckRunResult['warnings'] = [];
    const info: ParsedCheckRunResult['info'] = [];

    messageArray.forEach((msg) => {
      if (!msg || typeof msg !== 'object') {
        return;
      }

      const msgType = String(
        child(msg, '@_chkrun:type') ||
          child(msg, '@_type') ||
          child(msg, 'type') ||
          'I',
      );
      const shortText = child(msg, 'shortText');
      const text = String(
        child(msg, '@_chkrun:shortText') ||
          child(shortText, '#text') ||
          child(shortText, 'txt') ||
          shortText ||
          '',
      );
      // Where a message stands is its uri's `#start=`: a check message
      // carries no line of its own (`messageLocation`).
      const href =
        child(msg, '@_chkrun:uri') ||
        child(msg, '@_href') ||
        child(msg, 'href');
      const code = child(msg, '@_chkrun:code') || child(msg, '@_code');

      const bucket =
        msgType === 'E' ? errors : msgType === 'W' ? warnings : info;
      bucket.push({
        type: msgType,
        text,
        ...messageLocation({
          href: typeof href === 'string' ? href : undefined,
          code: typeof code === 'string' ? code : undefined,
        }),
      });
    });

    const hasErrors = errors.length > 0 || status === 'notProcessed';
    const success = status === 'processed' && errors.length === 0;

    return {
      success,
      status,
      message: statusText,
      errors,
      warnings,
      info,
      total_messages: messageArray.length,
      has_errors: hasErrors,
      has_warnings: warnings.length > 0,
    };
  } catch (error) {
    return {
      success: false,
      status: 'parse_error',
      message: `Failed to parse check run response: ${error}`,
      errors: [],
      warnings: [],
      info: [],
      total_messages: 0,
      has_errors: false,
      has_warnings: false,
    };
  }
}
