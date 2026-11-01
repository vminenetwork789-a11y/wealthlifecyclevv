import fs from 'fs';
import path from 'path';
import solc from 'solc';

const contractPath = path.resolve('contracts/FractalFlowMatrix27.sol');
const source = fs.readFileSync(contractPath, 'utf8');

const runs = 1;
console.log(`Compiling with optimizer runs: ${runs}...`);
const startTime = Date.now();
const input = {
  language: 'Solidity',
  sources: {
    'FractalFlowMatrix27.sol': {
      content: source,
    },
  },
  settings: {
    viaIR: true,
    optimizer: {
      enabled: true,
      runs: runs,
    },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
console.log(`Compiled in ${((Date.now() - startTime) / 1000).toFixed(2)}s`);

  if (output.errors) {
    let hasError = false;
    for (const err of output.errors) {
      if (err.severity === 'error') {
        console.error('ERROR:', err.formattedMessage);
        hasError = true;
      }
    }
    if (hasError) {
      process.exit(1);
    }
  }

  const contracts = output.contracts['FractalFlowMatrix27.sol'];
  const matrixContract = contracts['FractalFlowMatrix27'];
  if (matrixContract) {
    const deployedBytecode = matrixContract.evm.deployedBytecode.object;
    const sizeInBytes = deployedBytecode.length / 2;
    console.log(`Runs ${runs}: Deployed Bytecode Size = ${sizeInBytes} bytes (${(sizeInBytes / 1024).toFixed(2)} KB). EIP-170 Limit: 24,576 bytes.`);
    if (sizeInBytes > 24576) {
      console.log(`❌ EXCEEDS EIP-170 by ${sizeInBytes - 24576} bytes!`);
    } else {
      console.log(`✅ UNDER LIMIT! Remaining headroom: ${24576 - sizeInBytes} bytes.`);
  }
}
