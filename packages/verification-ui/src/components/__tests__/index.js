// @flow
import Enzyme from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';

Enzyme.configure({ adapter: new Adapter() });

// require all modules ending in ".spec.js" or ".spec.web.js" from the
// current directory and all subdirectories
const testsContext = (require: any).context('.', true, /\.spec(\.web)?\.js$/);
testsContext.keys().forEach(testsContext);
