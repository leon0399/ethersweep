#!/usr/bin/env node

process.on('warning', e => console.warn(e.stack));

import { program, InvalidArgumentError } from 'commander'
import ProgressBar from 'progress'

import ethers, { BigNumber } from 'ethers'
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
    .option('-G, --gas <gas>',            'Gas price in GWEI')
    .option('-n, --network <network>',    'Ethereum network to use', getNetwork, 1)

program.parse()

const opts = program.opts()

const hdNode = HDNode.fromMnemonic(opts.mnemonic)
console.log('🔑  Read mnemonic successfully')
console.log('⏳  Connecting to providers')
const provider = ethers.getDefaultProvider(opts.network, {
    infura: opts.infura,
    etherscan: opts.etherscan
})

const etherscan = new ethers.providers.EtherscanProvider(opts.network, opts.etherscan)
console.log('🌍  Connected to all providers successfully')

const gasPriceWei = ethers.utils.parseUnits(opts.gas, 'gwei')

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

const totalIndexes = 250; // to check/sweep

const purposes = [44, 49, 84, 0]
const coinTypes = [60, 61, ]
const accounts = [0, 1, 160720, 2147483644, 2147483645, 2147483646, 2147483647]
const changes = [0, 1]
const indexes = range(totalIndexes)

async function sweep() {
    const total = coinTypes.length * accounts.length * changes.length * indexes.length;

    const bar = new ProgressBar(':bar (:current/:total) :path', { 
        total,
        width: 120
    })

    for (let purposeIndex of purposes) {
        for (let coinType of coinTypes) {
            for (let accountIndex of accounts) {
                for (let changeIndex of changes) {
                    for (let addressIndex of indexes) {
                        const path = formatPath(addressIndex, changeIndex, accountIndex, coinType, purposeIndex)

                        bar.tick({ path })

                        const currentWallet = hdNode.derivePath(path)
                        const address = currentWallet.address

                        await checkBalance(currentWallet, console.log)

                        // bar.tick()
                    }
                }
            }
        }
    }
}

/**
 *
 * @param {HDNode} wallet
 */
async function checkBalance(wallet, log) {
    const address = wallet.address
    const path = wallet.path

    const [
        balance,
        erc20Txs,
        erc721Txs,
        erc1155Txs,
        nonce
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
        }),
        provider.getTransactionCount(address),
    ])

    const [
        hasBalance,
        hasErc20,
        hasErc721,
        hasErc1155,
        hasTxs,
    ] = [
        balance.gt(0),
        erc20Txs && erc20Txs.length > 0,
        erc721Txs && erc721Txs.length > 0,
        erc1155Txs && erc1155Txs.length > 0,
        nonce > 0,
    ]

    if (hasBalance || hasErc20 || hasErc721 || hasErc1155 || hasTxs) {
        log(`\n🕵️‍♂️  Found acive account at path=${path}, address=${address} => `)

        if (hasBalance) {
            log(`\tETH: ${ethers.utils.formatEther(balance)}`)

            // TODO: send ETH to address
        }

        if (hasErc20) {
            log(`\tERC20`)

            // TODO: send ERC20 to address
        }

        if (hasErc721) {
            log(`\tERC721`)

            // TODO: send NFT to address
        }

        if (hasErc1155) {
            log(`\tERC1155`)

            // TODO: send NFT to address
        }

        if (hasTxs) {
            log(`\tNonce: ${nonce}`)
        }
    }
}

/**
 *
 * @param {ethers.utils.HDNode} wallet
 * @param {BigNumberish} balance
 */
function sendEthAssets(wallet, balance) {
    const gasLimit = BigNumber.from('21000')
    const maxCostWei = gasPriceWei.mul(gasLimit)
    const realBalance = BigNumber.from(balance)
    const value = realBalance.sub(maxCostWei)
}

sweep()