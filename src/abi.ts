export const VERD_ABI = [
    "function proofId(uint64 sourceChainKey,uint64 sourceBlock,(uint8 kind,bytes32 root,bytes data) inclusionProof,(bytes32 lowerEndpointDigest,bytes32[] roots) continuityProof) pure returns (bytes32)",
    "function bindReserveLocker(bytes32 facilityId,uint64 sourceChainKey,uint64 sourceBlock,(uint8 kind,bytes32 root,bytes data) inclusionProof,(bytes32 lowerEndpointDigest,bytes32[] roots) continuityProof) returns (bytes32)",
    "function qualifyFacility(bytes32 facilityId,uint64 sourceChainKey,uint64 sourceBlock,(uint8 kind,bytes32 root,bytes data) inclusionProof,(bytes32 lowerEndpointDigest,bytes32[] roots) continuityProof) returns (bytes32)",
    "function getFacility(bytes32 facilityId) view returns (address lender,address borrower,uint256 principal,uint256 outstandingPrincipal,uint256 standardAprBps,uint256 preferredAprBps,uint256 currentAprBps,uint256 accruedInterest,uint64 maturity,uint64 qualificationDeadline,uint256 requiredReserveAmount,address reserveLocker)",
    "function getFacilityStatus(bytes32 facilityId) view returns (uint64 lastAccrualTimestamp,bool funded,bool drawn,bool preferredRateActive,bool repaid,bool reserveReleased,bool drawnAtPreferredRate,uint256 repaidAmount)",
    "function getFacilityProof(bytes32 facilityId) view returns (bytes32 qualificationProofId,uint64 qualificationSourceBlock,uint256 reserveReleaseAmount)",
    "function getFacilityLockerBinding(bytes32 facilityId) view returns (bytes32 bindingProofId,uint64 bindingSourceBlock,uint64 unlockTime)",
    "function lockerFacility(address locker) view returns (bytes32)",
    "function processedProof(bytes32 proofId) view returns (bool)",
];

export const AAVE_POOL_ABI = [
    "function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)",
    "event Supply(address indexed reserve,address user,address indexed onBehalfOf,uint256 amount,uint16 indexed referralCode)",
];

export const RESERVE_LOCKER_FACTORY_ABI = [
    "event ReserveLockerCreated(bytes32 indexed facilityId,address indexed locker,address indexed borrower,address aavePool,address reserveAsset,address aToken,uint64 unlockTime)",
];

export const LOCKER_ABI = [
    "function borrower() view returns (address)",
    "function aavePool() view returns (address)",
    "function reserveAsset() view returns (address)",
    "function aToken() view returns (address)",
    "function unlockTime() view returns (uint256)",
    "function aTokenBalance() view returns (uint256)",
];

export const ADDRESSES = Object.freeze({
    sepoliaWeth: "0xC558DBdd856501FCd9aaF1E62eae57A9F0629a3c",
    sepoliaAWeth: "0x5b071b590a59395fE4025A0Ccc1FcC931AAc1830",
    sepoliaAavePool: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
    sepoliaReserveLockerFactory: "0x018c883E0632D7a5754d15b7Da83A0e93554db03",
    sourceChainKey: 1,
    cc3ChainId: 102031,
    sepoliaChainId: 11155111,
});
