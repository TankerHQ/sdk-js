// @flow
import React from 'react';
import { createGlobalStyle } from 'styled-components';
import { Normalize } from 'styled-normalize';

import ContextHolder from './Context';
import Tanker from './Tanker';

const GlobalStyle = createGlobalStyle`
  .tanker-verification-ui *,
  .tanker-verification-ui *::before,
  .tanker-verification-ui *::after {
    box-sizing: border-box;
    text-rendering: optimizeLegibility;
  }

  .tanker-verification-ui {
    font-family: "Trebuchet MS", Helvetica, sans-serif;
  }
`;

type Props = { appId: string, email: string, check: string => Promise<void>, exit: () => void };
type State = { contextHolder: ?ContextHolder };
class Root extends React.Component<Props, State> {
  state = { contextHolder: null };

  componentDidMount() {
    this.setState({ contextHolder: new ContextHolder(this.forceUpdate.bind(this)) });
  }

  render() {
    const contextHolder = this.state.contextHolder;

    if (!contextHolder)
      return null;

    const { Consumer, Provider } = contextHolder.reactContext;

    return (
      <Provider value={contextHolder.context}>
        <Normalize />
        <GlobalStyle />
        <Consumer>{value => <Tanker {...this.props} context={value} />}</Consumer>
      </Provider>
    );
  }
}

export default Root;
