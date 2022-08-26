#!/usr/bin/env node

process.on('warning', e => console.warn(e.stack));

import { program, InvalidArgumentError } from 'commander'
import _progress, { SingleBar, MultiBar } from 'cli-progress'

import ethers from 'ethers'
import { getNetwork } from '@ethersproject/networks'
import { getAddress } from '@ethersproject/address'
import { HDNode, isValidMnemonic } from '@ethersproject/hdnode'

program
    .name('Ethereum Sweeper')
    .description('🕵️‍♂️ Find and sweep all the funds spendable by your ethereum accounts.')
    // .version(pkg.version)

program
    .option('--infura <key>',    'Infura API key')
    .option('--etherscan <key>', 'Etherscan API key')

program
    .option('-A, --all',     'Sweep all assets')
    .option('-E, --eth',     'Sweep ETH')
    .option('-T, --erc20',   'Sweep ERC20 tokens')
    .option('-N, --erc721',  'Sweep ERC721 NFTs')
    .option('-M, --erc1155', 'Sweep ERC1155 tokens')

program
    .option('--mnemonic <phrace>', 'wallet mnemonic phrase', (mnemonic) => {
        mnemonic = mnemonic.trim()

        if(!isValidMnemonic(mnemonic)) {
            throw new InvalidArgumentError('Not a valid mnemonic.')
        }

        return mnemonic
    })
    .option('-a, --to-address <address>', 'send all funds to this address', getAddress)
    .option('-G, --gas <gas>',            'gas price')
    .option('-n, --network <network>',    'Ethereum network to use', getNetwork, 1)

program.parse()

const opts = program.opts()

const hdNode = HDNode.fromMnemonic(opts.mnemonic)
const provider = ethers.getDefaultProvider(opts.network, {
    infura: opts.infura,
    etherscan: opts.etherscan
})

const etherscan = new ethers.providers.EtherscanProvider(opts.network, opts.etherscan)

/** @param {string} address */
async function getEthBalance(address) {
    const balance = await provider.getBalance(address)

    return balance
}

function range(size, startAt = 0) {
    return [...Array(size).keys()].map(i => i + startAt);
}

/**
 * 
 * @param {string|number} index 
 * @param {string|number} change 
 * @param {string|number} account 
 * @param {string|number} coinType 
 * @param {string|number} purpose 
 */
function formatPath(index = '1', change = '1', account = '1', coinType = '60', purpose = '44') {
    return `m/${purpose}'/${coinType}'/${account}'/${change}/${index}`
}

const totalChanges = 5; // to check/sweep
const totalIndexes = 5; // to check/sweep

const coinTypes = [60, 61, ]
const accounts = [0, 1, 160720]
const changes = range(totalChanges)
const indexes = range(totalIndexes)

async function sweep() {
    const progress = new MultiBar({
        format: '{bar} | {path} | ETA: {eta}s | {value}/{total}',
        hideCursor: true,
    }, _progress.Presets.shades_grey)

    const coinsBar = progress.create(coinTypes.length, 0);
    const accountsBar = progress.create(accounts.length, 0);
    const changesBar = progress.create(changes.length, 0);
    const indexesBar = progress.create(indexes.length, 0);

    coinsBar.start(coinTypes.length, 0)
    for (let coinType of coinTypes) {
        coinsBar.update({ path: formatPath('*', '*', '*', coinType) })

        accountsBar.start(accounts.length, 0)
        for (let a of accounts) {
            accountsBar.update({ path: formatPath('*', '*', a, coinType) })

            changesBar.start(changes.length, 0)
            for (let c of changes) {
                changesBar.update({ path: formatPath('*', c, a, coinType) })

                indexesBar.start(indexes.length, 0)
                for (let i of indexes) {
                    const path = formatPath(i, c, a, coinType)

                    const currentWallet = hdNode.derivePath(path)
                    const address = currentWallet.address

                    indexesBar.update({ path })

                    checkBalance(address, progress.log)

                    indexesBar.increment()
                }

                changesBar.increment()
            }

            accountsBar.increment()
        }

        coinsBar.increment()
    }
}

/**
 *
 * @param {string} address
 */
async function checkBalance(address, log) {
    const [
        balance,
        erc20Txs,
        erc721Txs,
        erc1155Txs,
    ] = await Promise.all([
        getEthBalance(address),
        etherscan.fetch('account', {
            action: "tokentx",
            address: address,
        }),
        etherscan.fetch('account', {
            action: "tokennfttx",
            address: address,
        }),
        etherscan.fetch('account', {
            action: "token1155tx",
            address: address,
        })
    ])

    if (balance.gt(0)) {
        log('Found non-null ETH account: Path: ' + path + '\t Address: ' + address + '\t ETH: ' + ethers.utils.formatEther(balance) + '\n')

        // TODO: send ETH to address
    }

    if (erc20Txs && erc20Txs.length > 0) {
        log('Found non-null ERC20 account: Path: ' + path + '\t Address: ' + address + '\n')

        // TODO: send ERC20 to address
    }

    if (erc721Txs && erc721Txs.length > 0) {
        log('Found non-null ERC721 account: Path: ' + path + '\t Address: ' + address + '\n')

        // TODO: send NFT to address
    }

    if (erc1155Txs && erc1155Txs.length > 0) {
        log('Found non-null ERC1155 account: Path: ' + path + '\t Address: ' + address + '\n')

        // TODO: send NFT to address
    }
}

sweep()