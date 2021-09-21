import React from 'react';
import { createGlobalStyle } from 'styled-components';
import { Normalize } from 'styled-normalize';

import makeContextHolder from '../context/makeContextHolder';
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

type Props = { appId: string; url: string; email: string; check: (arg0: string) => Promise<void>; exit: () => void; };
type State = { contextHolder: any; };
class Root extends React.Component<Props, State> {
  state = { contextHolder: null };

  componentDidMount() {
    const contextHolder = makeContextHolder();
    contextHolder.on('update', () => this.forceUpdate());
    this.setState({ contextHolder });
  }

  render() {
    const contextHolder = this.state.contextHolder;

    if (!contextHolder)
      return null;

    const { Consumer, Provider } = contextHolder.context;

    return (
      <Provider value={{ state: contextHolder.state, actions: contextHolder.actions }}>
        <Normalize />
        <GlobalStyle />
        <Consumer>{value => <Tanker {...this.props} context={value} />}</Consumer>
      </Provider>
    );
  }
}

export default Root;
