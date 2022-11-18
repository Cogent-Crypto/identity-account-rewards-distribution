import {Provider, Program, Wallet, AnchorProvider, setProvider} from "@project-serum/anchor";
import { sendAndConfirmTransaction} from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, NATIVE_MINT} from "@solana/spl-token";
import type { GemBank } from "./gem_bank_idl";
import GemBankIDL from "./gem_bank.json";
import type { GemFarm } from "./gem_farm_idl";
import GemFarmIDL from "./gem_farm.json";
import Fs from "@supercharge/fs";
import BN = require("bn.js")
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction} from "@solana/web3.js";
import {
  findFarmAuthorityPDA,
  findAuthorizationProofPDA,
  findRewardsPotPDA,
  VariableRateConfig
    
} from "@gemworks/gem-farm-ts";
import { createSyncNativeInstruction } from "./utils"
import * as BufferLayout from "@solana/buffer-layout"



const farmAccountPublicKey = new PublicKey("t1FM4DGJKpH6YVFke2DE1hGgFJwC2tkX1ZK7pTG4TYv");
const farmProgramPublicKey = new PublicKey("farmL4xeBFVXJqtfxCzU9b28QACM7E2W2ctT6epAjvE");
const bankAccountPublicKey = new PublicKey("AFg1xaskJEnWvW9kDUxbUWCq4P6hwaWgZWZwFaVWYYXq");
const bankProgramPublicKey = new PublicKey("bankHHdqMuaaST4qQk6mkzxGeKPHWmqdgor6Gs8r88m");
const ledgerPublickey = new PublicKey("7GmjpH2hpj3A5d6f1LTjXUAy8MR8FDTvZcPY79RDRDhq")
//wrapped sol token account address for Cogent51kHgGLHr7zpkpRjGYFXM57LgjHjDdqXd4ypdA
const wrappedSOLAssociatedTokenAddress = new PublicKey("G3t64S8JXBvnSGR3xDTviTFxbpNnqqUbm1BF14MJCXkX")


class GemFarmClient {
  connection: Connection;
  provider!: Provider;
  wallet:Wallet;

  farm: Program<GemFarm>;
  bank: Program<GemBank>;

  constructor(connection: Connection, wallet: Wallet) {
    this.connection = connection;
    this.wallet = wallet;
    this.provider = new AnchorProvider(this.connection, this.wallet, AnchorProvider.defaultOptions());
    setProvider(this.provider);

    // eslint-disable-next-line
    this.farm = new Program<GemFarm>(GemFarmIDL as any, farmProgramPublicKey, this.provider);
    // eslint-disable-next-line
    this.bank = new Program<GemBank>(GemBankIDL as any, bankProgramPublicKey, this.provider);
  } 

  async findAssociatedTokenAddress(
    tokenMintAddress: PublicKey
  ): Promise<PublicKey> {
    return (await PublicKey.findProgramAddress(
        [
            this.wallet.publicKey.toBuffer(),
            TOKEN_PROGRAM_ID.toBuffer(),
            tokenMintAddress.toBuffer(),
        ],
        ASSOCIATED_TOKEN_PROGRAM_ID
    ))[0];
  }

  async _createTransactionFromInstructions(instructions: TransactionInstruction[]): Promise<Transaction> {
    const recentBlockhash = await this.connection.getLatestBlockhash();
    const transaction = new Transaction({
      feePayer: this.wallet.publicKey,
      blockhash: recentBlockhash.blockhash,
      lastValidBlockHeight: recentBlockhash.lastValidBlockHeight
    });

    instructions.map((instruction) => transaction.add(instruction));
    return transaction;
  }

  async _submitInstructions(...instructions: TransactionInstruction[]): Promise<void> {
    const transaction = await this._createTransactionFromInstructions(instructions);
    const signedTxn = await this.wallet.signTransaction(transaction);
    const serializedTxn = signedTxn.serialize();
    console.log(`Submitting a transaction which is ${serializedTxn.length} bytes`);

  }

  async fundRewardIntructions(amount:number , durationSeconds: number): Promise<TransactionInstruction> {
    // const [farmAuth, farmAuthBump] = await findFarmAuthorityPDA(farmAccountPublicKey);
    const [authorizationProof, authorizationProofBump] = await findAuthorizationProofPDA(farmAccountPublicKey, this.wallet.publicKey);
    const [pot, potBump] = await findRewardsPotPDA(farmAccountPublicKey, NATIVE_MINT);
    const rewardSource = wrappedSOLAssociatedTokenAddress
    const rewardMint = NATIVE_MINT
    const variableRateConfig: VariableRateConfig = {
      amount: new BN(amount),
      durationSec:new BN(durationSeconds)
    }
   return this.farm.methods
      .fundReward(
      authorizationProofBump,
      potBump, 
      variableRateConfig,
      null, 
      )
      .accounts({
        farm: farmAccountPublicKey,
        authorizationProof,
        authorizedFunder: this.wallet.publicKey,
        rewardPot: pot,
        rewardSource,
        rewardMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      }).instruction()
    

  }

  async fundReward(lamports:number, seconds: number): Promise<void> {
    let instructions = await this.fundRewardIntructions(lamports, seconds);
    this._submitInstructions(instructions)
  }

  async getFarmGemCount(): Promise<number> {
    const farmAcc = await this.farm.account.farm.fetch(farmAccountPublicKey);
    return farmAcc.gemsStaked.toNumber();
  }

}

const decodedKey = new Uint8Array(
  JSON.parse(
  //replace with actual path from home dir. For example '.config/solana/devnet.json'
  Fs.readFileSync(Fs.homeDir("/root/validator-identity-cogent.json")).toString()
));

async function main() {
  console.log("time:",Date.now())
  let keyPair = Keypair.fromSecretKey(decodedKey);
  console.log("using",keyPair.publicKey)
  const wallet = new Wallet(keyPair);
  const connection = new Connection("<REPLACE_WITH_YOUR_RPC");
  const gfc = new GemFarmClient(connection, wallet);
  const gemsStaked = await gfc.getFarmGemCount();
  console.log("gemsStaked:", gemsStaked);


  const identity_balance = await connection.getBalance(wallet.publicKey);
  const balance_elibible_to_transfer = identity_balance - (LAMPORTS_PER_SOL*1.5)

  console.log("identity_balance:", identity_balance/LAMPORTS_PER_SOL);
  console.log("balance_elibible_to_transfer:", balance_elibible_to_transfer/LAMPORTS_PER_SOL);
  
  const percentToFund = gemsStaked/10000;
  console.log("percentToFund:",percentToFund*100,"%")

  const lamports_to_send_to_nft_holders = Math.floor(balance_elibible_to_transfer* percentToFund)
  const lamports_to_send_ledger = Math.floor(balance_elibible_to_transfer - lamports_to_send_to_nft_holders)
  console.log(`Sending ${lamports_to_send_to_nft_holders/LAMPORTS_PER_SOL} to NFT Holders`)
  console.log(`Sending ${lamports_to_send_ledger/LAMPORTS_PER_SOL} to ledger`)

  const durationSeconds = 3600; //dole our rewards over 1 hour

  if(balance_elibible_to_transfer < 2*LAMPORTS_PER_SOL) {
    console.log("balance is too low to send any lamports")
    return
  }

  const recentBlockhash = await connection.getLatestBlockhash();
    const transferSOLFundNFTTxn = new Transaction({
      feePayer: wallet.publicKey,
      blockhash: recentBlockhash.blockhash,
      lastValidBlockHeight: recentBlockhash.lastValidBlockHeight
    })
  .add(
    SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: wrappedSOLAssociatedTokenAddress,
        lamports: lamports_to_send_to_nft_holders
      }),
      createSyncNativeInstruction(
        wrappedSOLAssociatedTokenAddress
      )
  )
  .add(
    SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: ledgerPublickey,
        lamports: lamports_to_send_ledger
      }),
  )
  .add(
    await gfc.fundRewardIntructions(lamports_to_send_to_nft_holders, 3600)
  )
  await sendAndConfirmTransaction(connection, transferSOLFundNFTTxn, [keyPair]);



  

}

main()





// gfc.getFarmGemCount().then(console.log);
// gfc.findAssociatedTokenAddress(wrappSolMintAccountAddress).then((pubkey)=> console.log(pubkey.toString()));