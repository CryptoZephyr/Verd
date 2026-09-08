// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@gluwa/usc-contracts/contracts/write-ability/abstract/IUSCProofVerifier.sol";
import "@gluwa/usc-contracts/contracts/write-ability/common/BlockProverTypes.sol";
import "@gluwa/usc-contracts/contracts/write-ability/common/EvmV1Decoder.sol";

/// @notice Fixed-term working-capital facilities for the Verd hackathon MVP.
/// @dev Creditcoin state is authoritative for funding, draw, interest, and repayment.
contract Verd {
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    error InvalidConfiguration();
    error InvalidFacility();
    error FacilityAlreadyExists(bytes32 facilityId);
    error FacilityNotFound(bytes32 facilityId);
    error LockerAlreadyBound(address locker);
    error LockerNotBound();
    error LockerConfigurationMismatch();
    error LockerMaturityMismatch();
    error NotLender();
    error NotBorrower();
    error AlreadyFunded();
    error FundingAmountMismatch();
    error NotFunded();
    error AlreadyDrawn();
    error FacilityMatured();
    error InsufficientEscrow();
    error NotDrawn();
    error NotMatured();
    error AlreadyRepaid();
    error NotRepaid();
    error RepaymentAmountMismatch();
    error TransferFailed();
    error ReentrantCall();
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
    error FactoryEventMissing();
    error FactorySourceMismatch();
    error FactoryFacilityMismatch();
    error FactoryBorrowerMismatch();
    error ReleaseAlreadyRecorded(bytes32 facilityId);
    error ReleaseEventMissing();
    error ReleaseSourceMismatch();
    error ReleaseBorrowerMismatch();
    error ReleaseTokenMismatch();
    error InvalidReleaseAmount();

    enum FacilityState {
        Draft,
        FundingPending,
        AwaitingBorrowerAction,
        QualificationInProgress,
        PreferredRateConditionActive,
        DrawnAtStandardRate,
        DrawnAtPreferredRate,
        Active,
        QualificationExpired,
        Matured,
        RepaymentPending,
        Repaid,
        ReserveReleasable,
        Complete,
        FailedWithRecoveryRequired
    }

    struct Facility {
        bool exists;
        address lender;
        address borrower;
        uint256 principal;
        uint256 outstandingPrincipal;
        uint256 standardAprBps;
        uint256 preferredAprBps;
        uint256 currentAprBps;
        uint256 accruedInterest;
        uint64 maturity;
        uint64 qualificationDeadline;
        uint256 requiredReserveAmount;
        address reserveLocker;
        uint64 reserveLockerUnlockTime;
        uint64 lastAccrualTimestamp;
        bool funded;
        bool drawn;
        bool preferredRateActive;
        bool repaid;
        bool reserveReleased;
        bool drawnAtPreferredRate;
        uint256 repaidAmount;
        bytes32 qualificationProofId;
        uint64 qualificationSourceBlock;
        bytes32 lockerBindingProofId;
        uint64 lockerBindingSourceBlock;
        uint256 reserveReleaseAmount;
        bytes32 reserveReleaseProofId;
        uint64 reserveReleaseSourceBlock;
    }

    address public immutable proofVerifier;
    address public immutable approvedReserveLockerFactory;
    address public immutable approvedAavePool;
    address public immutable approvedReserveAsset;
    address public immutable approvedAToken;

    uint64 public constant ETHEREUM_SEPOLIA_CHAIN_KEY = 1;
    bytes32 public constant SUPPLY_EVENT_TOPIC =
        keccak256("Supply(address,address,address,uint256,uint16)");
    bytes32 public constant RESERVE_LOCKER_CREATED_TOPIC =
        keccak256("ReserveLockerCreated(bytes32,address,address,address,address,address,uint64)");
    bytes32 public constant RESERVE_RELEASED_TOPIC =
        keccak256("ReserveReleased(address,address,uint256)");

    mapping(bytes32 => Facility) private _facilities;
    mapping(address => bytes32) public lockerFacility;
    mapping(bytes32 => bool) public processedProof;

    uint256 private _reentrancyStatus = 1;

    event FacilityCreated(
        bytes32 indexed facilityId,
        address indexed lender,
        address indexed borrower,
        uint256 principal,
        uint256 standardAprBps,
        uint256 preferredAprBps,
        uint64 maturity,
        uint64 qualificationDeadline,
        uint256 requiredReserveAmount,
        address reserveLocker
    );

    event ReserveLockerBound(
        bytes32 indexed facilityId,
        bytes32 indexed proofId,
        uint64 indexed sourceBlock,
        address locker,
        address factory,
        address borrower,
        address reserveAsset,
        address aToken,
        uint64 unlockTime
    );

    event FacilityFunded(bytes32 indexed facilityId, address indexed lender, uint256 amount);

    event FacilityDrawn(
        bytes32 indexed facilityId,
        address indexed borrower,
        uint256 amount,
        uint256 currentAprBps
    );

    event InterestAccrued(
        bytes32 indexed facilityId,
        uint256 elapsedSeconds,
        uint256 interestAmount,
        uint256 totalAccruedInterest,
        uint256 currentAprBps
    );

    event FacilityRepaid(
        bytes32 indexed facilityId,
        address indexed borrower,
        address indexed lender,
        uint256 principalAmount,
        uint256 interestAmount,
        uint256 totalAmount
    );

    event ReserveReleaseRecorded(
        bytes32 indexed facilityId,
        bytes32 indexed proofId,
        uint64 indexed sourceBlock,
        address borrower,
        address locker,
        uint256 amount
    );

    event PreferredRateConditionActivated(
        bytes32 indexed facilityId,
        bytes32 indexed proofId,
        uint64 indexed sourceBlock,
        address borrower,
        address locker,
        address reserveAsset,
        uint256 suppliedAmount,
        uint256 previousAprBps,
        uint256 newAprBps,
        uint256 accruedInterest
    );

    constructor(
        address proofVerifier_,
        address approvedReserveLockerFactory_,
        address approvedAavePool_,
        address approvedReserveAsset_,
        address approvedAToken_
    ) {
        if (
            proofVerifier_ == address(0) ||
            approvedReserveLockerFactory_ == address(0) ||
            approvedAavePool_ == address(0) ||
            approvedReserveAsset_ == address(0) ||
            approvedAToken_ == address(0)
        ) revert InvalidConfiguration();

        proofVerifier = proofVerifier_;
        approvedReserveLockerFactory = approvedReserveLockerFactory_;
        approvedAavePool = approvedAavePool_;
        approvedReserveAsset = approvedReserveAsset_;
        approvedAToken = approvedAToken_;
    }

    modifier nonReentrant() {
        if (_reentrancyStatus != 1) revert ReentrantCall();
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

    function createFacility(
        bytes32 facilityId,
        address borrower,
        uint256 principal,
        uint256 standardAprBps,
        uint256 preferredAprBps,
        uint64 maturity,
        uint64 qualificationDeadline,
        uint256 requiredReserveAmount
    ) external {
        if (_facilities[facilityId].exists) revert FacilityAlreadyExists(facilityId);
        if (
            facilityId == bytes32(0) ||
            borrower == address(0) ||
            principal == 0 ||
            requiredReserveAmount == 0 ||
            preferredAprBps > standardAprBps ||
            maturity <= block.timestamp ||
            qualificationDeadline <= block.timestamp ||
            qualificationDeadline > maturity
        ) revert InvalidFacility();

        Facility storage facility = _facilities[facilityId];
        facility.exists = true;
        facility.lender = msg.sender;
        facility.borrower = borrower;
        facility.principal = principal;
        facility.standardAprBps = standardAprBps;
        facility.preferredAprBps = preferredAprBps;
        facility.currentAprBps = standardAprBps;
        facility.maturity = maturity;
        facility.qualificationDeadline = qualificationDeadline;
        facility.requiredReserveAmount = requiredReserveAmount;
        facility.lastAccrualTimestamp = uint64(block.timestamp);

        emit FacilityCreated(
            facilityId,
            msg.sender,
            borrower,
            principal,
            standardAprBps,
            preferredAprBps,
            maturity,
            qualificationDeadline,
            requiredReserveAmount,
            address(0)
        );
    }

    function bindReserveLocker(
        bytes32 facilityId,
        uint64 sourceChainKey,
        uint64 sourceBlock,
        BlockProverTypes.InclusionProof calldata inclusionProof,
        BlockProverTypes.ContinuityProof calldata continuityProof
    ) external nonReentrant returns (bytes32 id) {
        Facility storage facility = _facility(facilityId);
        if (sourceChainKey != ETHEREUM_SEPOLIA_CHAIN_KEY) revert UnsupportedSourceChain();
        if (facility.reserveLocker != address(0)) revert LockerAlreadyBound(facility.reserveLocker);
        if (block.timestamp >= facility.maturity) revert FacilityMatured();

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
        if (transaction.from != facility.borrower) revert FactoryBorrowerMismatch();
        if (transaction.to != approvedReserveLockerFactory) revert FactorySourceMismatch();

        EvmV1Decoder.ReceiptFields memory receipt =
            EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert SourceTransactionFailed();

        bool matched;
        address locker;
        address eventBorrower;
        uint64 unlockTime;
        for (uint256 i; i < receipt.receiptLogs.length; ++i) {
            EvmV1Decoder.LogEntry memory logEntry = receipt.receiptLogs[i];
            if (
                logEntry.address_ != approvedReserveLockerFactory ||
                logEntry.topics.length != 4 ||
                logEntry.topics[0] != RESERVE_LOCKER_CREATED_TOPIC
            ) continue;

            if (logEntry.topics[1] != facilityId) revert FactoryFacilityMismatch();
            locker = _topicAddress(logEntry.topics[2]);
            eventBorrower = _topicAddress(logEntry.topics[3]);
            (address eventPool, address eventReserve, address eventAToken, uint64 eventUnlockTime) =
                abi.decode(logEntry.data, (address, address, address, uint64));

            if (eventBorrower != facility.borrower) revert FactoryBorrowerMismatch();
            if (
                eventPool != approvedAavePool ||
                eventReserve != approvedReserveAsset ||
                eventAToken != approvedAToken
            ) revert LockerConfigurationMismatch();
            if (eventUnlockTime < facility.maturity) revert LockerMaturityMismatch();
            if (locker == address(0)) revert LockerConfigurationMismatch();
            if (lockerFacility[locker] != bytes32(0)) revert LockerAlreadyBound(locker);

            unlockTime = eventUnlockTime;
            matched = true;
            break;
        }
        if (!matched) revert FactoryEventMissing();

        processedProof[id] = true;
        facility.reserveLocker = locker;
        facility.reserveLockerUnlockTime = unlockTime;
        facility.lockerBindingProofId = id;
        facility.lockerBindingSourceBlock = sourceBlock;
        lockerFacility[locker] = facilityId;

        emit ReserveLockerBound(
            facilityId,
            id,
            sourceBlock,
            locker,
            approvedReserveLockerFactory,
            eventBorrower,
            approvedReserveAsset,
            approvedAToken,
            unlockTime
        );
    }

    function fundFacility(bytes32 facilityId) external payable {
        Facility storage facility = _facility(facilityId);
        if (msg.sender != facility.lender) revert NotLender();
        if (facility.funded) revert AlreadyFunded();
        if (msg.value != facility.principal) revert FundingAmountMismatch();
        if (block.timestamp >= facility.maturity) revert FacilityMatured();

        facility.funded = true;
        emit FacilityFunded(facilityId, msg.sender, msg.value);
    }

    function drawFacility(bytes32 facilityId) external nonReentrant returns (uint256 amount) {
        Facility storage facility = _facility(facilityId);
        if (msg.sender != facility.borrower) revert NotBorrower();
        if (!facility.funded) revert NotFunded();
        if (facility.drawn) revert AlreadyDrawn();
        if (block.timestamp >= facility.maturity) revert FacilityMatured();
        if (address(this).balance < facility.principal) revert InsufficientEscrow();

        facility.drawn = true;
        facility.drawnAtPreferredRate = facility.preferredRateActive;
        facility.outstandingPrincipal = facility.principal;
        facility.lastAccrualTimestamp = uint64(block.timestamp);

        amount = facility.principal;
        _sendValue(facility.borrower, amount);
        emit FacilityDrawn(facilityId, facility.borrower, amount, facility.currentAprBps);
    }

    function accrueInterest(bytes32 facilityId) external returns (uint256 totalAccruedInterest) {
        Facility storage facility = _facility(facilityId);
        if (!facility.drawn) revert NotDrawn();
        if (facility.repaid) revert AlreadyRepaid();
        _accrue(facilityId, facility);
        totalAccruedInterest = facility.accruedInterest;
    }

    function repayFacility(bytes32 facilityId) external payable nonReentrant {
        Facility storage facility = _facility(facilityId);
        if (msg.sender != facility.borrower) revert NotBorrower();
        if (!facility.drawn) revert NotDrawn();
        if (facility.repaid) revert AlreadyRepaid();
        if (block.timestamp < facility.maturity) revert NotMatured();

        _accrue(facilityId, facility);
        uint256 principalAmount = facility.outstandingPrincipal;
        uint256 interestAmount = facility.accruedInterest;
        uint256 totalAmount = principalAmount + interestAmount;
        if (msg.value < totalAmount) revert RepaymentAmountMismatch();

        facility.outstandingPrincipal = 0;
        facility.repaid = true;
        facility.repaidAmount = totalAmount;

        _sendValue(facility.lender, totalAmount);
        if (msg.value > totalAmount) _sendValue(facility.borrower, msg.value - totalAmount);
        emit FacilityRepaid(
            facilityId,
            facility.borrower,
            facility.lender,
            principalAmount,
            interestAmount,
            totalAmount
        );
    }

    /// @notice Authenticates the borrower's post-maturity ReserveLocker release on Ethereum.
    /// @dev The release remains borrower-authorized and time-based on Ethereum. This record
    ///      lets Creditcoin expose an inspectable, proof-backed completion state after both
    ///      repayment and release have happened.
    function recordReserveRelease(
        bytes32 facilityId,
        uint64 sourceChainKey,
        uint64 sourceBlock,
        BlockProverTypes.InclusionProof calldata inclusionProof,
        BlockProverTypes.ContinuityProof calldata continuityProof
    ) external nonReentrant returns (bytes32 id) {
        Facility storage facility = _facility(facilityId);
        if (sourceChainKey != ETHEREUM_SEPOLIA_CHAIN_KEY) revert UnsupportedSourceChain();
        if (!facility.repaid) revert NotRepaid();
        if (facility.reserveReleased) revert ReleaseAlreadyRecorded(facilityId);
        if (facility.reserveLocker == address(0)) revert LockerNotBound();
        if (block.timestamp < facility.maturity) revert NotMatured();

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
        if (transaction.from != facility.borrower) revert ReleaseBorrowerMismatch();
        if (transaction.to != facility.reserveLocker) revert ReleaseSourceMismatch();

        EvmV1Decoder.ReceiptFields memory receipt = EvmV1Decoder.decodeReceiptFields(encodedTransaction);
        if (receipt.receiptStatus != 1) revert SourceTransactionFailed();

        bool matched;
        uint256 releasedAmount;
        for (uint256 i; i < receipt.receiptLogs.length; ++i) {
            EvmV1Decoder.LogEntry memory logEntry = receipt.receiptLogs[i];
            if (
                logEntry.address_ != facility.reserveLocker ||
                logEntry.topics.length != 3 ||
                logEntry.topics[0] != RESERVE_RELEASED_TOPIC
            ) continue;

            address eventBorrower = _topicAddress(logEntry.topics[1]);
            address eventAToken = _topicAddress(logEntry.topics[2]);
            releasedAmount = abi.decode(logEntry.data, (uint256));
            if (eventBorrower != facility.borrower) revert ReleaseBorrowerMismatch();
            if (eventAToken != approvedAToken) revert ReleaseTokenMismatch();
            if (releasedAmount == 0) revert InvalidReleaseAmount();
            matched = true;
            break;
        }
        if (!matched) revert ReleaseEventMissing();

        processedProof[id] = true;
        facility.reserveReleased = true;
        facility.reserveReleaseAmount = releasedAmount;
        facility.reserveReleaseProofId = id;
        facility.reserveReleaseSourceBlock = sourceBlock;

        emit ReserveReleaseRecorded(
            facilityId,
            id,
            sourceBlock,
            facility.borrower,
            facility.reserveLocker,
            releasedAmount
        );
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

    function qualifyFacility(
        bytes32 facilityId,
        uint64 sourceChainKey,
        uint64 sourceBlock,
        BlockProverTypes.InclusionProof calldata inclusionProof,
        BlockProverTypes.ContinuityProof calldata continuityProof
    ) external nonReentrant returns (bytes32 id) {
        Facility storage facility = _facility(facilityId);
        if (sourceChainKey != ETHEREUM_SEPOLIA_CHAIN_KEY) revert UnsupportedSourceChain();
        if (!facility.funded) revert NotFunded();
        if (facility.preferredRateActive) revert QualificationAlreadyActive(facilityId);
        if (block.timestamp > facility.qualificationDeadline) revert QualificationExpired();
        if (block.timestamp >= facility.maturity) revert FacilityMatured();
        if (facility.reserveLocker == address(0)) revert LockerNotBound();
        if (facility.reserveLockerUnlockTime < facility.maturity) revert LockerMaturityMismatch();

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
        if (transaction.from != facility.borrower) revert SourceBorrowerMismatch();
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
            (address user, uint256 amount) = abi.decode(logEntry.data, (address, uint256));

            if (reserve != approvedReserveAsset) revert WrongSupplyReserve();
            if (user != facility.borrower) revert WrongSupplyUser();
            if (onBehalfOf != facility.reserveLocker) revert WrongSupplyLocker();
            if (rawReferralCode != 0) revert WrongReferralCode();

            matched = true;
            suppliedAmount = amount;
            break;
        }
        if (!matched) revert SupplyEventMissing();
        if (suppliedAmount < facility.requiredReserveAmount) {
            revert InsufficientSupplyAmount();
        }

        uint256 previousAprBps = facility.currentAprBps;
        _accrue(facilityId, facility);
        processedProof[id] = true;
        facility.preferredRateActive = true;
        facility.currentAprBps = facility.preferredAprBps;
        facility.qualificationProofId = id;
        facility.qualificationSourceBlock = sourceBlock;

        emit PreferredRateConditionActivated(
            facilityId,
            id,
            sourceBlock,
            facility.borrower,
            facility.reserveLocker,
            approvedReserveAsset,
            suppliedAmount,
            previousAprBps,
            facility.currentAprBps,
            facility.accruedInterest
        );
    }

    function facilityExists(bytes32 facilityId) external view returns (bool) {
        return _facilities[facilityId].exists;
    }

    function isFunded(bytes32 facilityId) external view returns (bool) {
        return _facilities[facilityId].funded;
    }

    function getFacility(bytes32 facilityId)
        external
        view
        returns (
            address lender,
            address borrower,
            uint256 principal,
            uint256 outstandingPrincipal,
            uint256 standardAprBps,
            uint256 preferredAprBps,
            uint256 currentAprBps,
            uint256 accruedInterest,
            uint64 maturity,
            uint64 qualificationDeadline,
            uint256 requiredReserveAmount,
            address reserveLocker
        )
    {
        Facility storage facility = _facilities[facilityId];
        return (
            facility.lender,
            facility.borrower,
            facility.principal,
            facility.outstandingPrincipal,
            facility.standardAprBps,
            facility.preferredAprBps,
            facility.currentAprBps,
            facility.accruedInterest,
            facility.maturity,
            facility.qualificationDeadline,
            facility.requiredReserveAmount,
            facility.reserveLocker
        );
    }

    function getFacilityStatus(bytes32 facilityId)
        external
        view
        returns (
            uint64 lastAccrualTimestamp,
            bool funded,
            bool drawn,
            bool preferredRateActive,
            bool repaid,
            bool reserveReleased,
            bool drawnAtPreferredRate,
            uint256 repaidAmount
        )
    {
        Facility storage facility = _facilities[facilityId];
        return (
            facility.lastAccrualTimestamp,
            facility.funded,
            facility.drawn,
            facility.preferredRateActive,
            facility.repaid,
            facility.reserveReleased,
            facility.drawnAtPreferredRate,
            facility.repaidAmount
        );
    }

    function getFacilityFinancials(bytes32 facilityId)
        external
        view
        returns (
            uint256 outstandingPrincipal,
            uint256 accruedInterest,
            uint256 currentAprBps
        )
    {
        Facility storage facility = _facilities[facilityId];
        return (
            facility.outstandingPrincipal,
            facility.accruedInterest,
            facility.currentAprBps
        );
    }

    function getFacilityProof(bytes32 facilityId)
        external
        view
        returns (
            bytes32 qualificationProofId,
            uint64 qualificationSourceBlock,
            uint256 reserveReleaseAmount
        )
    {
        Facility storage facility = _facilities[facilityId];
        return (
            facility.qualificationProofId,
            facility.qualificationSourceBlock,
            facility.reserveReleaseAmount
            );
    }

    function getFacilityReleaseEvidence(bytes32 facilityId)
        external
        view
        returns (
            bytes32 releaseProofId,
            uint64 releaseSourceBlock,
            uint256 releaseAmount
        )
    {
        Facility storage facility = _facilities[facilityId];
        return (
            facility.reserveReleaseProofId,
            facility.reserveReleaseSourceBlock,
            facility.reserveReleaseAmount
        );
    }

    function getFacilityLockerBinding(bytes32 facilityId)
        external
        view
        returns (
            bytes32 bindingProofId,
            uint64 bindingSourceBlock,
            uint64 unlockTime
        )
    {
        Facility storage facility = _facilities[facilityId];
        return (
            facility.lockerBindingProofId,
            facility.lockerBindingSourceBlock,
            facility.reserveLockerUnlockTime
        );
    }

    function facilityState(bytes32 facilityId) external view returns (FacilityState) {
        Facility storage facility = _facilities[facilityId];
        if (!facility.exists) return FacilityState.Draft;
        if (!facility.funded) return FacilityState.FundingPending;
        if (!facility.drawn) {
            if (facility.preferredRateActive) return FacilityState.PreferredRateConditionActive;
            if (block.timestamp > facility.qualificationDeadline) {
                return FacilityState.QualificationExpired;
            }
            return FacilityState.AwaitingBorrowerAction;
        }
        if (!facility.repaid) {
            if (block.timestamp >= facility.maturity) return FacilityState.RepaymentPending;
            if (facility.drawnAtPreferredRate) return FacilityState.DrawnAtPreferredRate;
            return FacilityState.DrawnAtStandardRate;
        }
        if (facility.reserveReleased) return FacilityState.Complete;
        if (facility.reserveLockerUnlockTime != 0 && block.timestamp >= facility.reserveLockerUnlockTime) {
            return FacilityState.ReserveReleasable;
        }
        return FacilityState.Repaid;
    }

    function _facility(bytes32 facilityId) private view returns (Facility storage facility) {
        facility = _facilities[facilityId];
        if (!facility.exists) revert FacilityNotFound(facilityId);
    }

    function _accrue(bytes32 facilityId, Facility storage facility) private {
        uint256 currentTimestamp = block.timestamp;
        uint256 elapsed = currentTimestamp - facility.lastAccrualTimestamp;
        if (elapsed == 0) return;

        uint256 interestAmount;
        if (facility.outstandingPrincipal != 0) {
            interestAmount =
                facility.outstandingPrincipal * facility.currentAprBps * elapsed /
                BASIS_POINTS /
                SECONDS_PER_YEAR;
            facility.accruedInterest += interestAmount;
            emit InterestAccrued(
                facilityId,
                elapsed,
                interestAmount,
                facility.accruedInterest,
                facility.currentAprBps
            );
        }
        facility.lastAccrualTimestamp = uint64(currentTimestamp);
    }

    function _sendValue(address recipient, uint256 amount) private {
        (bool sent,) = recipient.call{value: amount}("");
        if (!sent) revert TransferFailed();
    }

    function _topicAddress(bytes32 topic) private pure returns (address) {
        return address(uint160(uint256(topic)));
    }
}
