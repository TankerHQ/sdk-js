import React from 'react';
import { createGlobalStyle } from 'styled-components';
import { Normalize } from 'styled-normalize';

import makeContextHolder from '../context/makeContextHolder';
import type { ContextHolder, Context } from '../context/makeContextHolder';
import Tanker from './Tanker';
import type { TankerProps } from './Tanker';

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

type RootProps = Omit<TankerProps, 'context'>;
type State = { contextHolder: ContextHolder | null; };
class Root extends React.Component<RootProps, State> {
  constructor(props: RootProps | Readonly<RootProps>) {
    super(props);

    this.state = { contextHolder: null };
  }

  override componentDidMount() {
    const contextHolder = makeContextHolder();
    contextHolder.on('update', () => this.forceUpdate());
    this.setState({ contextHolder });
  }

  override render() {
    const contextHolder = this.state.contextHolder;

    if (!contextHolder)
      return null;

    const { Consumer, Provider } = contextHolder.context;

    return (
      <Provider value={{ state: contextHolder.state, actions: contextHolder.actions }}>
        <Normalize />
        <GlobalStyle />
        <Consumer>{(value: Context) => <Tanker {...this.props} context={value} />}</Consumer>
      </Provider>
    );
  }
}

export default Root;
