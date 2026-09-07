import { useCallback, useEffect, useState } from "react";
import { CC3, SEPOLIA, connectWallet, short, switchToCc3, switchToSepolia } from "../data/verd";

export function useWallet() {
  const [account, setAccount] = useState<string>();
  const [chainId, setChainId] = useState<number>();
  const [error, setError] = useState<string>();
  const connect = useCallback(async () => {
    setError(undefined);
    try { const result = await connectWallet(); setAccount(result.account); setChainId(result.chainId); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Wallet connection failed."); }
  }, []);
  const switchNetwork = useCallback(async () => {
    setError(undefined);
    try { await switchToCc3(); setChainId(CC3.chainId); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Network switch failed."); }
  }, []);
  const switchSepolia = useCallback(async () => {
    setError(undefined);
    try { await switchToSepolia(); setChainId(SEPOLIA.chainId); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Sepolia network switch failed."); }
  }, []);
  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum) return;
    const accountsChanged = (accounts: unknown) => setAccount(Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : undefined);
    const chainChanged = (id: unknown) => setChainId(typeof id === "string" ? Number.parseInt(id, 16) : undefined);
    void ethereum.request({ method: "eth_accounts" }).then(accountsChanged).catch(() => undefined);
    void ethereum.request({ method: "eth_chainId" }).then(chainChanged).catch(() => undefined);
    if (!("on" in ethereum) || typeof ethereum.on !== "function") return;
    ethereum.on("accountsChanged", accountsChanged); ethereum.on("chainChanged", chainChanged);
    return () => { if ("removeListener" in ethereum && typeof ethereum.removeListener === "function") { ethereum.removeListener("accountsChanged", accountsChanged); ethereum.removeListener("chainChanged", chainChanged); } };
  }, []);
  return { account, accountLabel: account ? short(account) : undefined, chainId, correctNetwork: chainId === CC3.chainId, sepoliaNetwork: chainId === SEPOLIA.chainId, error, connect, switchNetwork, switchSepolia };
}
