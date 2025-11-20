import { AxiosResponse } from 'axios';
import { XMLParser } from 'fast-xml-parser';

export interface ParsedCheckRunResult {
  success: boolean;
  status: string;
  message: string;
  errors: Array<{ type: string; text: string; line?: string | number; href?: string }>;
  warnings: Array<{ type: string; text: string; line?: string | number; href?: string }>;
  info: Array<{ type: string; text: string; line?: string | number; href?: string }>;
  total_messages: number;
  has_errors: boolean;
  has_warnings: boolean;
}

export function parseCheckRunResponse(response: AxiosResponse): ParsedCheckRunResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  });

  try {
    const data = typeof response.data === 'string' ? response.data : response.data?.toString?.() || '';
    const result = parser.parse(data);

    let checkReport =
      result['chkrun:checkRunReports']?.['chkrun:checkReport'] ??
      result['checkRunReports']?.['checkReport'] ??
      result['chkrun:checkReport'] ??
      result['checkReport'];

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
        has_warnings: false
      };
    }

    const status =
      checkReport['@_chkrun:status'] ||
      checkReport['chkrun:status'] ||
      checkReport['@_status'] ||
      checkReport['status'] ||
      'unknown';

    const statusText =
      checkReport['chkrun:statusText'] ||
      checkReport['@_chkrun:statusText'] ||
      checkReport['statusText'] ||
      checkReport['@_statusText'] ||
      '';

    const messages =
      checkReport['chkrun:checkMessageList']?.['chkrun:checkMessage'] ??
      checkReport['checkMessageList']?.['checkMessage'] ??
      checkReport['chkrun:messages']?.['msg'] ??
      checkReport['messages']?.['msg'] ??
      checkReport['chkrun:messages'] ??
      checkReport['messages'] ??
      [];

    const messageArray = Array.isArray(messages) ? messages : messages ? [messages] : [];

    const errors: ParsedCheckRunResult['errors'] = [];
    const warnings: ParsedCheckRunResult['warnings'] = [];
    const info: ParsedCheckRunResult['info'] = [];

    messageArray.forEach(msg => {
      if (!msg || typeof msg !== 'object') {
        return;
      }

      const msgType = msg['@_chkrun:type'] || msg['@_type'] || msg['type'] || 'I';
      const shortText =
        msg['@_chkrun:shortText'] ||
        msg['shortText']?.['#text'] ||
        msg['shortText']?.['txt'] ||
        msg['shortText'] ||
        '';
      const line = msg['@_line'] || msg['line'];
      const href = msg['@_chkrun:uri'] || msg['@_href'] || msg['href'];

      const bucket = msgType === 'E' ? errors : msgType === 'W' ? warnings : info;
      bucket.push({
        type: msgType,
        text: shortText,
        line,
        href
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
      has_warnings: warnings.length > 0
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
      has_warnings: false
    };
  }
}

