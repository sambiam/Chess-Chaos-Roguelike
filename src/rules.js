const STARTING_TURN = 1;
const FIRST_TURN_WITH_NEW_RULES = 4;
const STARTING_PLAYER = 'white';

// Stores the states of rules and turns
export const rules = {
    currentTurn: STARTING_TURN,
    nextTurnWithNewRules: FIRST_TURN_WITH_NEW_RULES,
    currentPlayer: STARTING_PLAYER,
    currentRules: [],
    newRuleChoices: null,
};

