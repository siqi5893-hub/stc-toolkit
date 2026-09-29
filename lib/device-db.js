'use strict';

function classifyDevice(name = '') {
  const n = String(name).toUpperCase().replace(/\s+/g, '');
  if (/^(STC33|AI8051U)/.test(n)) return { family: 'NEXT_GEN', generation: 'new', preferred: 'official' };
  if (/^STC32G144K246/.test(n)) return { family: 'STC32G144K246', generation: 'new', preferred: 'official' };
  if (/^STC32/.test(n)) return { family: 'STC32', generation: 'new', preferred: 'native-hid' };
  if (/^STC8H8K64U/.test(n)) return { family: 'STC8H_USB', generation: 'new', preferred: 'native-hid' };
  if (/^STC8G|^STC8H/.test(n)) return { family: 'STC8G/H', generation: 'legacy', preferred: 'stcgal', stcgal: 'stc8g' };
  if (/^STC8/.test(n)) return { family: 'STC8', generation: 'legacy', preferred: 'stcgal', stcgal: 'stc8d' };
  if (/^STC15/.test(n)) return { family: 'STC15', generation: 'legacy', preferred: 'stcgal', stcgal: 'stc15' };
  if (/^STC1[012]/.test(n)) return { family: 'STC10/11/12', generation: 'legacy', preferred: 'stcgal', stcgal: 'stc12' };
  if (/^STC(89|90)/.test(n)) return { family: 'STC89/90', generation: 'legacy', preferred: 'stcgal', stcgal: 'stc89' };
  return { family: 'unknown', generation: 'unknown', preferred: 'stcgal', stcgal: 'auto' };
}

function suggestedProtocol(deviceInfo) {
  return deviceInfo?.stcgal || 'auto';
}

module.exports = { classifyDevice, suggestedProtocol };
