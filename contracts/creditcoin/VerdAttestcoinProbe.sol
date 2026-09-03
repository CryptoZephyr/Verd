// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@gluwa/usc-contracts/contracts/write-ability/abstract/IUSCProofVerifier.sol";
import "@gluwa/usc-contracts/contracts/write-ability/common/BlockProverTypes.sol";
import "@gluwa/usc-contracts/contracts/write-ability/common/EvmV1Decoder.sol";

/// @notice Minimal CC3 state transition for the Verd Phase 0 proof spike.
/// @dev It delegates inclusion and continuity verification to the current USC verifier path,
///      then authenticates the decoded Aave Supply receipt before changing state.
contract VerdAttestcoinProbe {
    error UnsupportedSourceChain();
    error ProofAlreadyProcessed(bytes32 proofId);
    error QualificationAlreadyActive(bytes32 facilityId);
    error QualificationExpired();
    error SourceTransactionFailed();
    error SourceBorrowerMismatch();
    error SourcePoolMismatch();
    error SupplyEventMissing();
    error WrongSupplyReserve();
    error WrongSupplyUser();
    error WrongSupplyLocker();
    error WrongReferralCode();
    error InsufficientSupplyAmount();
    error LockerMaturityMismatch();

    uint64 public constant ETHEREUM_SEPOLIA_CHAIN_KEY = 1;
    bytes32 public constant SUPPLY_EVENT_TOPIC =
        keccak256("Supply(address,address,address,uint256,uint16)");

    address public immutable proofVerifier;
    address public immutable approvedAavePool;
    address public immutable approvedReserveAsset;
    address public immutable approvedAToken;

    mapping(bytes32 => bool) public processedProof;
    mapping(bytes32 => bool) public preferredRateActive;
    mapping(bytes32 => bytes32) public facilityProof;
    mapping(bytes32 => uint256) public facilityAmount;
    mapping(bytes32 => uint64) public facilitySourceBlock;

    event QualificationAccepted(
        bytes32 indexed facilityId,
        bytes32 indexed proofId,
        uint64 indexed sourceBlock,
        address borrower,
        address locker,
        address reserveAsset,
        uint256 amount
    );

    constructor(
        address proofVerifier_,
        address approvedAavePool_,
        address approvedReserveAsset_,
        address approvedAToken_
    ) {
        proofVerifier = proofVerifier_;
        approvedAavePool = approvedAavePool_;
        approvedReserveAsset = approvedReserveAsset_;
        approvedAToken = approvedAToken_;
    }

    function proofId(
        uint64 sourceChainKey,
        uint64 sourceBlock,
        BlockProverTypes.InclusionProof calldata inclusionProof,
        BlockProverTypes.ContinuityProof calldata continuityProof
    ) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                sourceChainKey,
                sourceBlock,
                inclusionProof.kind,
                inclusionProof.root,
                keccak256(inclusionProof.data),
                continuityProof.lowerEndpointDigest,
                keccak256(abi.encode(continuityProof.roots))
            )
        );
    }

    function qualify(
        bytes32 facilityId,
        uint64 sourceChainKey,
        uint64 sourceBlock,
        BlockProverTypes.InclusionProof calldata inclusionProof,
        BlockProverTypes.ContinuityProof calldata continuityProof,
        address expectedBorrower,
        address locker,
        uint256 requiredAmount,
        uint64 qualificationDeadline,
        uint64 facilityMaturity
    ) external returns (bytes32 id) {
        if (sourceChainKey != ETHEREUM_SEPOLIA_CHAIN_KEY) revert UnsupportedSourceChain();
        if (preferredRateActive[facilityId]) revert QualificationAlreadyActive(facilityId);
        if (block.timestamp > qualificationDeadline) revert QualificationExpired();

        id = proofId(sourceChainKey, sourceBlock, inclusionProof, continuityProof);
        if (processedProof[id]) revert ProofAlreadyProcessed(id);

        bytes memory encodedTransaction = IUSCProofVerifier(proofVerifier).verifyProofs(
            bytes32(uint256(sourceChainKey)),
            sourceBlock,
            inclusionProof,
            continuityProof
        );

        EvmV1Decoder.CommonTxFields memory transaction =
            EvmV1Decoder.decodeCommonTxFields(encodedTransaction);
        if (transaction.from != expectedBorrower) revert SourceBorrowerMismatch();
        if (transaction.to != approvedAavePool) revert SourcePoolMismatch();

        EvmV1Decoder.ReceiptFields memory receipt =
            EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert SourceTransactionFailed();

        bool matched;
        uint256 suppliedAmount;
        for (uint256 i; i < receipt.receiptLogs.length; ++i) {
            EvmV1Decoder.LogEntry memory logEntry = receipt.receiptLogs[i];
            if (
                logEntry.address_ != approvedAavePool ||
                logEntry.topics.length != 4 ||
                logEntry.topics[0] != SUPPLY_EVENT_TOPIC
            ) continue;

            address reserve = _topicAddress(logEntry.topics[1]);
            address onBehalfOf = _topicAddress(logEntry.topics[2]);
            uint256 rawReferralCode = uint256(logEntry.topics[3]);
            (address user, uint256 amount) = abi.decode(
                logEntry.data,
                (address, uint256)
            );

            if (reserve != approvedReserveAsset) revert WrongSupplyReserve();
            if (user != expectedBorrower) revert WrongSupplyUser();
            if (onBehalfOf != locker) revert WrongSupplyLocker();
            if (rawReferralCode != 0) revert WrongReferralCode();

            matched = true;
            suppliedAmount = amount;
            break;
        }
        if (!matched) revert SupplyEventMissing();
        if (suppliedAmount < requiredAmount) revert InsufficientSupplyAmount();

        if (facilityMaturity <= block.timestamp) revert LockerMaturityMismatch();
        processedProof[id] = true;
        preferredRateActive[facilityId] = true;
        facilityProof[facilityId] = id;
        facilityAmount[facilityId] = suppliedAmount;
        facilitySourceBlock[facilityId] = sourceBlock;

        emit QualificationAccepted(
            facilityId,
            id,
            sourceBlock,
            expectedBorrower,
            locker,
            approvedReserveAsset,
            suppliedAmount
        );
    }

    function _topicAddress(bytes32 topic) private pure returns (address) {
        return address(uint160(uint256(topic)));
    }
}
