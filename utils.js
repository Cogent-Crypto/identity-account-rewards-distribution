import * as BufferLayout from "@solana/buffer-layout"
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, NATIVE_MINT} from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction} from "@solana/web3.js";

export function createSyncNativeInstruction(nativeAccount) {
  
    const dataLayout = BufferLayout.struct([BufferLayout.u8('instruction')]);
    const data = Buffer.alloc(dataLayout.span);
    dataLayout.encode({
      instruction: 17 // SyncNative instruction
  
    }, data);
    let keys = [{
      pubkey: nativeAccount,
      isSigner: false,
      isWritable: true
    }];
    return new TransactionInstruction({
      keys,
      programId: TOKEN_PROGRAM_ID,
      data
    });
  }