const { ApiPromise, WsProvider, Keyring } = require('@polkadot/api');
const { hexToU8a } = require('@polkadot/util');

class MessageQueueBot {
  constructor(wsEndpoint) {
    this.wsEndpoint = wsEndpoint;
    this.api = null;
    this.account = null;
    this.isProcessing = false;
    this.unsubscribeNewHeads = null;
  }

  async initialize() {
    const provider = new WsProvider(this.wsEndpoint);
    this.api = await ApiPromise.create({ provider });
    const keyring = new Keyring({ type: 'sr25519' });
    this.account = keyring.addFromUri(process.env.MNEMONIC);
    console.log('Connected to chain with', this.account.address);
  }

  async loadPages() {
    const entries = await this.api.query.messageQueue.pages.entries();
    return entries.map(([key, value]) => {
      const [messageOrigin, pageNumber] = key.args;
      return {
        messageOrigin: messageOrigin.toJSON(), // This will be either { Parent: number } or { Sibling: number }
        pageIndex: pageNumber.toString(),
        data: value.toJSON()
      };
    });
  }

  async processNewBlock(blockHash) {
    if (this.isProcessing) {
      console.log('Already processing a block, skipping...');
      return;
    }

    try {
      this.isProcessing = true;
      console.log(`Processing block: ${blockHash}`);

      const pages = await this.loadPages();
      if (pages.length === 0) {
        console.log('No messages to process');
        return;
      }
      const head = await this.api.query.messageQueue.serviceHead().then(h => h.toHuman());
      if (head !== null) {
        console.log('On chain processing of', head);
        return;
      }

      const batch = [];
      // Calculate a reasonable weight limit based on your chain's configuration
      const weightLimit = { refTime: 1000000000, proofSize: 100000 }; 

      for (const { messageOrigin, pageIndex, data } of pages) {
        if (data.remaining > 0) {
          console.log(`Creating extrinsic for messageOrigin:`, messageOrigin, `page:`, pageIndex);
          
          const call = this.api.tx.messageQueue.executeOverweight(
            messageOrigin,  // message_origin from storage key
            pageIndex,      // page number from storage key
            0,             // index is always 0
            weightLimit    // weight_limit
          );
          batch.push(call);
        }
      }

      if (batch.length > 0) {
        console.log(`Sending batch of ${batch.length} extrinsics`);
        await this.sendBatch(batch);
      }

    } catch (error) {
      console.error('Error processing block:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  async sendBatch(batch) {
    try {
      // Create a batch call
      const batchCall = this.api.tx.utility.forceBatch(batch);

      console.log(batchCall.toHex())

      const callFinished = new Promise();
      
      // Sign and send the transaction
      const unsub = await batchCall.signAndSend(this.account, ({ status, events = [] }) => {
        console.log(`Transaction status: ${status.type}`);

        if (status.isInBlock) {
          console.log(`Included in block: ${status.asInBlock}`);
          events.forEach(({ event: { data, method, section } }) => {
            if (method === 'ExtrinsicSuccess') {
              console.log('\tExtrinsic succeeded');
            } else if (method === 'ExtrinsicFailed') {
              console.log('\tExtrinsic failed:', data.toString());
            } else {
              console.log(`\t${section}.${method}:`, data.toString());
            }
          });
        } else if (status.isFinalized) {
          console.log(`Finalized block hash: ${status.asFinalized}`);
          callFinished.
          unsub();
        }
      });
    } catch (error) {
      console.error('Error sending batch:', error);
    }
  }

  async start() {
    try {
      process.on('SIGINT', async () => {
        console.log('Stopping bot...');
        await bot.stop();
        process.exit(0);
      });

      await this.initialize();
      
      // Subscribe to new blocks
      this.unsubscribeNewHeads = await this.api.rpc.chain.subscribeNewHeads((header) => {
        this.processNewBlock(header.hash.toString());
      });

      console.log('Bot started successfully');
    } catch (error) {
      console.error('Error starting bot:', error);
      await this.stop();
    }
  }

  async stop() {
    if (this.unsubscribeNewHeads) {
      this.unsubscribeNewHeads();
      this.unsubscribeNewHeads = null;
    }

    if (this.api) {
      await this.api.disconnect();
      this.api = null;
    }

    console.log('Bot stopped');
  }
}


this.isProcessing = false;

module.exports = MessageQueueBot;