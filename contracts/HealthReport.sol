// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Records externally observed health reports; it does not protect or modify lending positions.
contract HealthReport {
    uint8 public constant UNKNOWN = 0;
    uint8 public constant SAFE = 1;
    uint8 public constant WARNING = 2;
    uint8 public constant DANGER = 3;

    event HealthReported(
        address indexed watched,
        uint256 healthFactor,
        uint8 riskLevel,
        uint256 timestamp
    );

    /// @param healthFactor Health factor scaled by 1e18.
    /// @param riskLevel 0=UNKNOWN, 1=SAFE, 2=WARNING, 3=DANGER.
    function report(address watched, uint256 healthFactor, uint8 riskLevel) external {
        require(watched != address(0), "zero watched address");
        require(riskLevel <= DANGER, "invalid risk level");
        emit HealthReported(watched, healthFactor, riskLevel, block.timestamp);
    }
}