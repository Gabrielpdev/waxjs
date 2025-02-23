"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WaxSigningApi = void 0;
const eosjs_ecc_migration_1 = require("eosjs/dist/eosjs-ecc-migration");
const helpers_1 = require("./helpers");
const version_1 = require("./version");
const WaxEventSource_1 = require("./WaxEventSource");
function getCurrentTime() {
    return Math.floor(new Date().getTime());
}
class WaxSigningApi {
    constructor(waxSigningURL, waxAutoSigningURL, rpc, metricURL, returnTempAccount) {
        this.waxSigningURL = waxSigningURL;
        this.waxAutoSigningURL = waxAutoSigningURL;
        this.rpc = rpc;
        this.metricURL = metricURL;
        this.returnTempAccount = returnTempAccount;
        this.nonce = "";
        this.waxEventSource = new WaxEventSource_1.WaxEventSource(waxSigningURL);
        this.metricURL = metricURL;
        this.returnTempAccount = returnTempAccount;
        this.rpc = rpc;
    }
    logout() {
        this.user = null;
    }
    login(nonce) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.user) {
                this.nonce = nonce;
                yield this.loginViaWindow();
            }
            if (this.user) {
                return this.user;
            }
            throw new Error("Login failed");
        });
    }
    tryAutologin() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.user) {
                return true;
            }
            try {
                yield this.loginViaEndpoint();
                return true;
            }
            catch (e) {
                return false;
            }
        });
    }
    prepareTransaction(transaction) {
        return __awaiter(this, void 0, void 0, function* () {
            // if (!this.canAutoSign(transaction)) {
            //   this.signingWindow = await this.waxEventSource.openPopup(
            //     `${this.waxSigningURL}/cloud-wallet/signing/`
            //   );
            // }
        });
    }
    metricLog(name, value = 0, tags = []) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.metricURL !== "") {
                    yield fetch(this.metricURL, {
                        method: "POST",
                        headers: {
                            Accept: "application/json",
                            "Content-Type": "application/json",
                        },
                        body: JSON.stringify({ name, value, tags }),
                    });
                }
            }
            catch (e) {
                console.debug(e);
                // do nothing
            }
        });
    }
    signing(transaction, serializedTransaction, noModify = false, feeFallback = true) {
        return __awaiter(this, void 0, void 0, function* () {
            // if (this.canAutoSign(transaction)) {
            //   try {
            //     const startTime = getCurrentTime();
            //     const res = await this.signViaEndpoint(
            //       serializedTransaction,
            //       noModify,
            //       feeFallback
            //     );
            //     await this.metricLog(
            //       "waxjs.metric.auto_signing",
            //       getCurrentTime() - startTime,
            //       []
            //     );
            //     return res;
            //   } catch {
            //     // handle by continuing
            //   }
            // }
            return yield this.signViaWindow(serializedTransaction, this.signingWindow, noModify, feeFallback);
        });
    }
    proofWindow(nonce, type, description) {
        return __awaiter(this, void 0, void 0, function* () {
            const verifyUrl = `${this.waxSigningURL}/cloud-wallet/verify`;
            const referWindow = yield this.waxEventSource.openEventSource(verifyUrl, {
                type: "VERIFY",
                nonce,
                proof_type: type,
                description,
            });
            return this.waxEventSource.onceEvent(referWindow, this.waxSigningURL, this.receiveVerfication.bind(this), undefined);
        });
    }
    loginViaWindow() {
        return __awaiter(this, void 0, void 0, function* () {
            const url = new URL(`${this.waxSigningURL}/cloud-wallet/login`);
            if (this.returnTempAccount) {
                url.searchParams.append("returnTemp", "true");
            }
            if (version_1.version) {
                url.searchParams.append("v", Buffer.from(version_1.version).toString("base64"));
            }
            if (this.nonce) {
                url.searchParams.append("n", Buffer.from(this.nonce).toString("base64"));
            }
            const confirmationWindow = yield this.waxEventSource.openEventSource(url.toString());
            return this.waxEventSource.onceEvent(confirmationWindow, this.waxSigningURL, this.receiveLogin.bind(this), undefined);
        });
    }
    loginViaEndpoint() {
        return __awaiter(this, void 0, void 0, function* () {
            const url = new URL(`${this.waxAutoSigningURL}login`);
            if (this.returnTempAccount) {
                url.search = "returnTemp=true";
            }
            else {
                url.search = "";
            }
            const response = yield fetch(url.toString(), {
                credentials: "include",
                method: "get",
            });
            if (!response.ok) {
                throw new Error(`Login Endpoint Error ${response.status} ${response.statusText}`);
            }
            const data = yield response.json();
            if (data.processed && data.processed.except) {
                throw new Error(data);
            }
            return this.receiveLogin({ data });
        });
    }
    signViaEndpoint(serializedTransaction, noModify = false, feeFallback = true) {
        return __awaiter(this, void 0, void 0, function* () {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), 5000);
            const response = yield fetch(`${this.waxAutoSigningURL}signing`, {
                body: JSON.stringify({
                    freeBandwidth: !noModify,
                    feeFallback,
                    transaction: Object.values(serializedTransaction),
                    waxjsVersion: version_1.version,
                }),
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                method: "POST",
                signal: controller.signal,
            });
            if (!response.ok) {
                this.whitelistedContracts = [];
                throw new Error(`Signing Endpoint Error ${response.status} ${response.statusText}`);
            }
            const data = yield response.json();
            if (data.processed && data.processed.except) {
                this.whitelistedContracts = [];
                throw new Error(`Error returned from signing endpoint: ${JSON.stringify(data)}`);
            }
            return this.receiveSignatures({ data });
        });
    }
    receiveVerfication(event) {
        if (event.data.type === "DENY") {
            throw new Error("User Denied Verification");
        }
        return Object.assign({}, event.data);
    }
    signViaWindow(serializedTransaction, window, noModify = false, feeFallback = true) {
        return __awaiter(this, void 0, void 0, function* () {
            const startTime = getCurrentTime();
            const confirmationWindow = yield this.waxEventSource.openEventSource(`${this.waxSigningURL}/cloud-wallet/signing/`, {
                startTime,
                feeFallback,
                freeBandwidth: !noModify,
                transaction: serializedTransaction,
                type: "TRANSACTION",
                waxjsVersion: version_1.version,
            }, window);
            return this.waxEventSource.onceEvent(confirmationWindow, this.waxSigningURL, this.receiveSignatures.bind(this), "TX_SIGNED");
        });
    }
    receiveLogin(event) {
        return __awaiter(this, void 0, void 0, function* () {
            const { verified, userAccount, pubKeys, whitelistedContracts, isTemp, createData, avatar_url: avatarUrl, trustScore, proof, } = event.data;
            let isProofVerified = false;
            if (!verified) {
                throw new Error("User declined to share their user account");
            }
            if (!userAccount || !pubKeys) {
                throw new Error("User does not have a blockchain account");
            }
            if ((proof === null || proof === void 0 ? void 0 : proof.verified) && this.nonce) {
                // handle proof logic
                const message = `cloudwallet-verification-${proof.data.referer}-${this.nonce}-${userAccount}`;
                isProofVerified = eosjs_ecc_migration_1.ecc.verify(proof.data.signature, message, yield (0, helpers_1.getProofWaxRequiredKeys)(this.rpc.endpoint));
            }
            this.whitelistedContracts = whitelistedContracts || [];
            this.user = {
                account: userAccount,
                keys: pubKeys,
                isTemp,
                createData,
                avatarUrl,
                trustScore,
                isProofVerified,
            };
            return true;
        });
    }
    receiveSignatures(event) {
        return __awaiter(this, void 0, void 0, function* () {
            if (event.data.type === "TX_SIGNED") {
                const { verified, signatures, whitelistedContracts, serializedTransaction, startTime, } = event.data;
                if (!verified || !signatures) {
                    throw new Error("User declined to sign the transaction");
                }
                this.whitelistedContracts = whitelistedContracts || [];
                if (startTime && startTime > 0) {
                    this.metricLog("waxjs.metric.manual_sign_transaction_time", getCurrentTime() - startTime, []);
                }
                return { serializedTransaction, signatures };
            }
            throw new Error(`Unexpected response received when attempting signing: ${JSON.stringify(event.data)}`);
        });
    }
    canAutoSign(transaction) {
        if (typeof navigator !== "undefined") {
            const ua = navigator.userAgent.toLowerCase();
            if (ua.search("chrome") === -1 && ua.search("safari") >= 0) {
                return false;
            }
        }
        return !transaction.actions.find((action) => !this.isWhitelisted(action));
    }
    isWhitelisted(action) {
        return !!(this.whitelistedContracts &&
            !!this.whitelistedContracts.find((w) => {
                if (w.contract === action.account) {
                    if (action.account === "eosio.token" && action.name === "transfer") {
                        return w.recipients.includes(action.data.to);
                    }
                    return true;
                }
                return false;
            }));
    }
}
exports.WaxSigningApi = WaxSigningApi;
