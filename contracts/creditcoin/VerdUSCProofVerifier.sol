// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@gluwa/usc-contracts/contracts/write-ability/common/USCProofVerifier.sol";

/// @notice Thin deployment wrapper for the current official USC proof verifier.
/// @dev The inherited implementation delegates inclusion and continuity checks to CC3's native precompile.
contract VerdUSCProofVerifier is USCProofVerifier {}
